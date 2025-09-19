# AGENTS.md

## Project
**Name:** Chatbot ↔ Azure AI Foundry Agent  
**Purpose:** Provide a chat UI that forwards messages to a single Azure AI Foundry Agent and streams (polls) replies via the Assistants-compatible API.

---

## Repository layout
```
.
├── packages
│   ├── server   # Express + TypeScript backend that proxies Azure AI Foundry
│   └── web      # Vite + React frontend chat interface
├── package.json
├── pnpm-workspace.yaml
├── .env.example
└── AGENTS.MD
```

### Backend (`packages/server`)
- Express server exposing `POST /api/chat` and `GET /healthz`.
- Express server exposing `GET /` (service metadata), `GET /healthz`, and `POST /api/chat`.
- Uses `@azure/identity` for OAuth and Azure AI Foundry REST endpoints for threads/messages/runs.
- Validates payloads with `zod`.
- Requires Azure client credentials; otherwise responds with `503`.

### Frontend (`packages/web`)
- React app with a simple chat interface.
- Talks to the backend at `/api/chat` (proxied during local dev).
- Persists the current thread identifier returned by the backend.

---

## Setup
1. **Install dependencies** (Node ≥ 18.20 + pnpm 8+):
   ```bash
   pnpm install
   ```
2. **Environment** – copy `.env.example` → `.env` and supply Azure + server values. The backend will refuse chat requests until all Azure variables are present.

---

## Development workflows
- **Full stack dev server:** `pnpm dev`
- **Backend only:** `pnpm dev:server`
- **Frontend only:** `pnpm dev:web`
- **Build all packages:** `pnpm build`

### Quality gates (run after changes)
- **Typecheck / lint:** `pnpm lint`
- **Unit tests (placeholder):** `pnpm test`
- **Static typecheck only:** `pnpm typecheck`
- **Format check:** `pnpm format`

> The lint/test commands currently delegate to TypeScript checks or informative echoes. Expand them as the project matures.

---

## Azure configuration
The following environment variables must be provided (in `.env`, deployment secrets, or hosting environment):
- `AZURE_AI_FOUNDRY_ENDPOINT` – `https://<service>.services.ai.azure.com`
- `AZURE_AI_FOUNDRY_PROJECT` – Project slug
- `AZURE_AI_FOUNDRY_AGENT_ID` – Target agent identifier
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` – Entra ID app registration for client-credential auth
- Optional: `ALLOWED_ORIGINS`, `PORT`, `LOG_LEVEL`

No secrets should be committed. The backend reads configuration at startup and caches the credential client.

---

## Deployment notes
- The server is stateless. Deploy both frontend and backend (or serve the built frontend from a CDN / static host and proxy `/api` to the server).
- Ensure outbound HTTPS access to Azure AI Foundry and that environment variables are set in the deployment target.
- Consider enabling HTTPS termination and adding application logging/telemetry (e.g., Application Insights via `APPINSIGHTS_CONNECTION_STRING`).

---

## Agent limitations / TODOs
- Responses are polled (no streaming chunks yet).
- There is no persistence beyond Azure threads; local caching, auth, and multi-user session management are out of scope.
- Tests are placeholders. Add integration tests once Azure test credentials are available.
- Frontend currently lacks markdown rendering and attachments.
