import { FormEvent, useEffect, useRef, useState } from "react";

type Role = "user" | "assistant" | "system" | "tool";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

interface ChatResponse {
  threadId: string;
  messages: ChatMessage[];
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`message ${isUser ? "message-user" : "message-assistant"}`}
      data-role={message.role}
    >
      <div className="message-meta">
        <span className="message-role">{isUser ? "You" : "Agent"}</span>
        <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
      </div>
      <div className="message-body">{message.content}</div>
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError(null);

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          threadId: threadId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = (await response.json()) as ChatResponse;
      setThreadId(data.threadId);
      setMessages(data.messages);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error while contacting the agent",
      );
      setMessages((prev) =>
        prev.filter((message) => !message.id.startsWith("local-")),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Azure AI Foundry Agent Chat</h1>
        <p>
          Chat with your Azure-hosted agent. Conversations are persisted on
          Azure via thread IDs.
        </p>
      </header>
      <main className="chat">
        <section className="messages">
          {messages.length === 0 && (
            <div className="empty">Send a message to start a conversation.</div>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </section>
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            placeholder="Ask anything..."
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
            rows={3}
          />
          <div className="composer-actions">
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
            >
              {loading ? "Waiting..." : "Send"}
            </button>
            {threadId && <span className="thread">Thread: {threadId}</span>}
          </div>
        </form>
        {error && <div className="error">{error}</div>}
      </main>
      <footer className="page-footer">
        <small>
          Backend is proxied on <code>/api</code>. Provide Azure credentials in{" "}
          <code>.env</code> for end-to-end usage.
        </small>
      </footer>
    </div>
  );
}
