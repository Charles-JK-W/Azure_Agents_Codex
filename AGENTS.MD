# AGENTS.md

## Project
**Name:** Chatbot ↔ Azure AI Foundry Agent  
**Purpose:** A user-facing chat UI that forwards messages to a *single* Azure AI Foundry Agent and streams the reply.

---

## How this project works (high level)
- The frontend collects the user's input and calls our backend `/api/chat`.
- The backend uses **Azure AI Foundry Agent Service** to:
  1) create (or reuse) a **thread**,  
  2) append a **user message**,  
  3) start a **run** against our **agent** (identified by `AZURE_AI_FOUNDRY_AGENT_ID`),  
  4) poll run status and then read **assistant messages** from the thread.  
- Auth is via **Microsoft Entra ID** (service-to-service / app registration). No API keys are sent from the browser.  
- The service follows an **Assistants-like** API surface: `agents`, `threads`, `messages`, `runs`.  

---

## Commands Codex should use

### Setup
- **Install (Node):** `pnpm install` (or `npm i` / `yarn`)
- **Install (Python):** `uv pip install -r requirements.txt` (or `pip install -r requirements.txt`)
- **Env:** Copy `.env.example` to `.env` and fill values.

### Run
- **Dev server:** `pnpm dev`
- **Backend only:** `pnpm dev:server`
- **Frontend only:** `pnpm dev:web`

### Test & Lint
- **Tests:** `pnpm test`
- **Typecheck:** `pnpm typecheck`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`

> If these scripts don't exist yet, **create them** in `package.json`.

---

## Environment configuration Codex must respect
These variables are **required** for local and CI runs. Never hardcode them. Read from `process.env` (Node) or `os.environ` (Python).

- `AZURE_AI_FOUNDRY_ENDPOINT` — `https://<service>.services.ai.azure.com` (no trailing slash)
- `AZURE_AI_FOUNDRY_PROJECT` — Foundry **project** name slug
- `AZURE_AI_FOUNDRY_AGENT_ID` — The target agent/assistant id
- **Auth (Entra ID)**: either developer login in dev **or** client credentials in CI
  - `AZURE_TENANT_ID`
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET` (CI/hosted only; never commit)
- (Optional) `APPINSIGHTS_CONNECTION_STRING` — enable tracing/telemetry
- (Optional) `PORT`, `LOG_LEVEL`, `ALLOWED_ORIGINS` — server config

---

## Minimal backend call patterns

### REST (Node/TypeScript)
- Use `@azure/identity` to fetch a bearer token for resource `https://ai.azure.com`.
- Hit the project-scoped endpoint:

```ts
// src/lib/foundry.ts
import fetch from "node-fetch";
import { ClientSecretCredential } from "@azure/identity";

const {
  AZURE_AI_FOUNDRY_ENDPOINT,
  AZURE_AI_FOUNDRY_PROJECT,
  AZURE_AI_FOUNDRY_AGENT_ID,
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
} = process.env;

const credential = new ClientSecretCredential(
  AZURE_TENANT_ID!,
  AZURE_CLIENT_ID!,
  AZURE_CLIENT_SECRET!
);

async function authHeader() {
  const token = await credential.getToken("https://ai.azure.com/.default");
  return { Authorization: `Bearer ${token!.token}`, "Content-Type": "application/json" };
}

const base = `${AZURE_AI_FOUNDRY_ENDPOINT}/api/projects/${AZURE_AI_FOUNDRY_PROJECT}`;

export async function chatOnce(userText: string) {
  const headers = await authHeader();

  // 1) create a thread
  const thread = await fetch(`${base}/threads?api-version=2025-05-01`, { method: "POST", headers }).then(r => r.json());

  // 2) add user message
  await fetch(`${base}/threads/${thread.id}/messages?api-version=2025-05-01`, {
    method: "POST",
    headers,
    body: JSON.stringify({ role: "user", content: userText }),
  });

  // 3) run the agent
  const run = await fetch(`${base}/threads/${thread.id}/runs?api-version=2025-05-01`, {
    method: "POST",
    headers,
    body: JSON.stringify({ assistant_id: AZURE_AI_FOUNDRY_AGENT_ID }),
  }).then(r => r.json());

  // 4) poll until completed (simplified)
  let status = run.status;
  while (status === "queued" || status === "in_progress") {
    await new Promise(r => setTimeout(r, 800));
    const r2 = await fetch(`${base}/threads/${thread.id}/runs/${run.id}?api-version=2025-05-01`, { headers }).then(r => r.json());
    status = r2.status;
  }

  // 5) read messages
  const msgs = await fetch(`${base}/threads/${thread.id}/messages?api-version=2025-05-01`, { headers }).then(r => r.json());
  const last = msgs.data?.find((m: any) => m.role === "assistant");
  return last?.content ?? "";
}
