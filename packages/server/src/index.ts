import "dotenv/config";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import { AzureFoundryClient } from "./azureFoundryClient.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = express();

const corsOrigins = config.ALLOWED_ORIGINS;
if (corsOrigins && corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
} else {
  app.use(cors());
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const chatPayloadSchema = z.object({
  message: z.string().trim().min(1, "Message cannot be empty"),
  threadId: z.string().trim().min(1).optional(),
});

const azureClient = config.azure ? new AzureFoundryClient(config.azure) : null;

if (!azureClient) {
  console.warn(
    "Azure AI Foundry credentials are missing. /api/chat will return 503 until configured.",
  );
}

app.get("/", (_req, res) => {
  res.json({
    name: "Azure AI Foundry chat relay",
    status: "ok",
    azureConfigured: Boolean(azureClient),
    endpoints: {
      health: "/healthz",
      chat: "/api/chat",
    },
  });
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", azureConfigured: Boolean(azureClient) });
});

app.post("/api/chat", async (req, res) => {
  if (!azureClient) {
    res
      .status(503)
      .json({ error: "Azure AI Foundry credentials are not configured." });
    return;
  }

  const parsed = chatPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await azureClient.sendMessage(
      parsed.data.message,
      parsed.data.threadId,
    );
    res.json({ threadId: result.threadId, messages: result.messages });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: "Azure agent request failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = config.PORT;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
