<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Daily Cash Reconciliation Pro

A professional financial tracking tool for daily business operations, featuring
automated cash reconciliation, income analysis, and AI-powered financial
insights. The frontend is built with React + Vite and served by an Express
backend that integrates with the Gemini API and Google Sheets.

## 🚀 Live Deployment

The app is deployed on **Google Cloud Run**:

**https://peekaboo-app-757490984314.us-central1.run.app/**

| Setting          | Value             |
| ---------------- | ----------------- |
| Service name     | `peekaboo-app`    |
| Region           | `us-central1`     |
| Project number   | `757490984314`    |
| Container port   | `8080`            |

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables (see [Environment Variables](#environment-variables)).
3. Run the dev server (Vite, with `/api` proxied to the backend on port 8080):
   ```bash
   npm run dev
   ```
4. To run the production-style server locally:
   ```bash
   npm run build && npm start
   ```
   Then open http://localhost:8080.

## Environment Variables

The Express backend (`server.js`) reads the following at runtime:

| Variable         | Description                                                    |
| ---------------- | ------------------------------------------------------------- |
| `GEMINI_API_KEY` | Gemini API key used for AI-powered analysis.                  |
| `GEMINI_MODEL`   | Gemini model id (default: `gemini-2.5-pro`).                  |
| `SPREADSHEET_ID` | Google Sheet id used for reading/writing daily closings.     |
| `SHEET_NAME`     | Worksheet/tab name (default: `Daily Closings`).              |
| `CORS_ORIGINS`   | Comma-separated allowlist of origins (empty = allow all).    |
| `PORT`           | Port the server listens on (Cloud Run sets this; default 8080). |

Frontend (Vite) variables live in `.env` and are prefixed with `VITE_`.

## Deploy to Cloud Run

### Option A — Automatic (GitHub Actions)

Pushes to the deployment branch trigger
[`.github/workflows/deploy-cloud-run.yml`](.github/workflows/deploy-cloud-run.yml),
which builds the container and deploys it to the `peekaboo-app` service.

Configure these repository **secrets** and **variables** under
*Settings → Secrets and variables → Actions*:

**Secrets**

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Workload Identity Federation provider
  resource name (recommended), **or** `GCP_SA_KEY` — a service-account JSON key.
- `GCP_SERVICE_ACCOUNT` — deploy service account email (required for WIF).

**Variables**

- `GCP_PROJECT_ID` — the GCP project id that owns the service.
- `GCP_REGION` — defaults to `us-central1`.
- `CLOUD_RUN_SERVICE` — defaults to `peekaboo-app`.

### Option B — Manual (gcloud)

```bash
gcloud run deploy peekaboo-app \
  --source . \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

This uses the included [`Dockerfile`](Dockerfile) to build the image, run
`npm run build`, and start `node server.js`.

## Fetching Data from Cloud Run

[`fetch_cloud_run_data.py`](fetch_cloud_run_data.py) calls the deployed service
using Google Application Default Credentials (handy when the service requires
authentication). See the docstring in that file for usage.
