import { randomUUID } from "crypto";
import { ClientSecretCredential } from "@azure/identity";
import type { AzureConfig } from "./config.js";

const API_VERSION = "2025-05-01";

export interface FoundryMessage {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  createdAt: string;
}

interface FoundryRun {
  id: string;
  status: string;
}

export class AzureFoundryClient {
  private readonly credential: ClientSecretCredential;
  private readonly baseUrl: string;

  constructor(private readonly config: AzureConfig) {
    this.credential = new ClientSecretCredential(
      config.AZURE_TENANT_ID,
      config.AZURE_CLIENT_ID,
      config.AZURE_CLIENT_SECRET,
    );
    this.baseUrl = `${config.AZURE_AI_FOUNDRY_ENDPOINT}/api/projects/${config.AZURE_AI_FOUNDRY_PROJECT}`;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.credential.getToken(
      "https://ai.azure.com/.default",
    );
    if (!token) {
      throw new Error("Failed to acquire Azure access token");
    }
    return {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    };
  }

  private url(path: string): string {
    const separator = path.startsWith("/") ? "" : "/";
    const query = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}${separator}${path}${query}api-version=${API_VERSION}`;
  }

  private static normaliseContent(raw: any): string {
    if (typeof raw === "string") {
      return raw;
    }

    if (!raw) {
      return "";
    }

    if (Array.isArray(raw)) {
      return raw
        .map((chunk) => {
          if (!chunk) {
            return "";
          }
          if (typeof chunk === "string") {
            return chunk;
          }
          if (typeof chunk.text === "string") {
            return chunk.text;
          }
          if (typeof chunk.content === "string") {
            return chunk.content;
          }
          if (typeof chunk.value === "string") {
            return chunk.value;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    if (typeof raw.text === "string") {
      return raw.text;
    }
    if (Array.isArray(raw.text)) {
      return raw.text
        .map((item: unknown) => AzureFoundryClient.normaliseContent(item))
        .join("\n");
    }

    return "";
  }

  private mapMessage(message: any): FoundryMessage {
    return {
      id: message.id ?? randomUUID(),
      role: message.role ?? "assistant",
      content: AzureFoundryClient.normaliseContent(message.content),
      createdAt: message.created_at ?? new Date().toISOString(),
    };
  }

  async ensureThread(threadId?: string): Promise<string> {
    if (threadId) {
      return threadId;
    }

    const headers = await this.authHeaders();
    const response = await fetch(this.url("/threads"), {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to create thread (${response.status})`);
    }

    const body = await response.json();
    if (!body?.id) {
      throw new Error("Thread creation response did not include an id");
    }
    return body.id as string;
  }

  async appendUserMessage(threadId: string, content: string): Promise<void> {
    const headers = await this.authHeaders();
    const response = await fetch(this.url(`/threads/${threadId}/messages`), {
      method: "POST",
      headers,
      body: JSON.stringify({ role: "user", content }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Failed to append user message (${response.status}): ${detail}`,
      );
    }
  }

  async startRun(threadId: string): Promise<FoundryRun> {
    const headers = await this.authHeaders();
    const response = await fetch(this.url(`/threads/${threadId}/runs`), {
      method: "POST",
      headers,
      body: JSON.stringify({
        assistant_id: this.config.AZURE_AI_FOUNDRY_AGENT_ID,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Failed to start run (${response.status}): ${detail}`);
    }

    return (await response.json()) as FoundryRun;
  }

  async pollRun(
    threadId: string,
    runId: string,
    timeoutMs = 120_000,
  ): Promise<FoundryRun> {
    const start = Date.now();
    const headers = await this.authHeaders();

    while (Date.now() - start < timeoutMs) {
      const response = await fetch(
        this.url(`/threads/${threadId}/runs/${runId}`),
        {
          method: "GET",
          headers,
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Failed to inspect run (${response.status}): ${detail}`,
        );
      }

      const run = (await response.json()) as FoundryRun;
      if (!run.status || !["queued", "in_progress"].includes(run.status)) {
        return run;
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    throw new Error("Timed out while waiting for the agent response");
  }

  async listMessages(threadId: string): Promise<FoundryMessage[]> {
    const headers = await this.authHeaders();
    const response = await fetch(
      this.url(`/threads/${threadId}/messages?order=asc`),
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Failed to fetch messages (${response.status}): ${detail}`,
      );
    }

    const payload = await response.json();
    const data: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
    return data.map((message) => this.mapMessage(message));
  }

  async sendMessage(
    content: string,
    threadId?: string,
  ): Promise<{
    threadId: string;
    messages: FoundryMessage[];
    run: FoundryRun;
  }> {
    const resolvedThreadId = await this.ensureThread(threadId);
    await this.appendUserMessage(resolvedThreadId, content);
    const run = await this.startRun(resolvedThreadId);
    const finalRun = await this.pollRun(resolvedThreadId, run.id);
    const messages = await this.listMessages(resolvedThreadId);
    return { threadId: resolvedThreadId, messages, run: finalRun };
  }
}
