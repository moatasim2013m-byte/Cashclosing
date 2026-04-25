"""
Fetch data from the current Google Cloud Run service.

Configuration via environment variables:
  CLOUD_RUN_URL   - The base URL of the Cloud Run service (required)
  CLOUD_RUN_PATH  - The endpoint path to call (default: "/")
  OUTPUT_FILE     - Path to write JSON output (optional; prints to stdout if unset)

Authentication is handled automatically via Application Default Credentials (ADC).
Run `gcloud auth application-default login` locally, or deploy with a service account
that has the `roles/run.invoker` IAM role on the target Cloud Run service.
"""

import json
import os
import sys

import google.auth
import google.auth.transport.requests
import requests
from google.oauth2 import id_token


def get_id_token(audience: str) -> str:
    """Obtain an OIDC ID token for the given Cloud Run audience URL."""
    auth_req = google.auth.transport.requests.Request()
    token = id_token.fetch_id_token(auth_req, audience)
    return token


def fetch_data(url: str, path: str = "/") -> dict:
    """Call the Cloud Run service and return the parsed JSON response."""
    endpoint = url.rstrip("/") + "/" + path.lstrip("/")
    try:
        token = get_id_token(url)
    except Exception as exc:
        raise RuntimeError(f"Failed to obtain ID token for {url}: {exc}") from exc

    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(endpoint, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.exceptions.HTTPError as exc:
        raise RuntimeError(
            f"HTTP error calling {endpoint} (status {response.status_code}): {exc}"
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Network error calling {endpoint}: {exc}") from exc

    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"Invalid JSON response from {endpoint}: {exc}"
        ) from exc


def main() -> None:
    cloud_run_url = os.environ.get("CLOUD_RUN_URL")
    if not cloud_run_url:
        print("Error: CLOUD_RUN_URL environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    path = os.environ.get("CLOUD_RUN_PATH", "/")
    output_file = os.environ.get("OUTPUT_FILE")

    try:
        data = fetch_data(cloud_run_url, path)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    payload = json.dumps(data, indent=2)

    if output_file:
        with open(output_file, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print(f"Data written to {output_file}")
    else:
        print(payload)


if __name__ == "__main__":
    main()
