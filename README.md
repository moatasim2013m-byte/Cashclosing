# Cashclosing – Fetch Data from Cloud Run

This script fetches data from a Google Cloud Run service and prints it as JSON (or writes it to a file).

## Requirements

- Python 3.8+
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) configured, **or** running on a GCP resource (Compute Engine, Cloud Run, etc.) whose service account has the `roles/run.invoker` IAM role on the target service.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Minimal – prints JSON to stdout
CLOUD_RUN_URL=https://<your-service>-<hash>-<region>.a.run.app python fetch_cloud_run_data.py

# With a specific endpoint path
CLOUD_RUN_URL=https://<your-service>-<hash>-<region>.a.run.app \
CLOUD_RUN_PATH=/api/cashclosing \
python fetch_cloud_run_data.py

# Write output to a file
CLOUD_RUN_URL=https://<your-service>-<hash>-<region>.a.run.app \
OUTPUT_FILE=output.json \
python fetch_cloud_run_data.py
```

## Environment Variables

| Variable         | Required | Default | Description                                      |
|------------------|----------|---------|--------------------------------------------------|
| `CLOUD_RUN_URL`  | ✅       | –       | Base URL of the Cloud Run service                |
| `CLOUD_RUN_PATH` | ❌       | `/`     | Endpoint path to call on the service             |
| `OUTPUT_FILE`    | ❌       | –       | File path for JSON output (stdout if not set)    |
