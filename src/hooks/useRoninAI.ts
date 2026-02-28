import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const RONIN_AI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`;

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session ? `Bearer ${data.session.access_token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
}

export function useRoninAI() {
  const [isStreaming, setIsStreaming] = useState(false);

  /** Send a chat message and stream the response back token-by-token */
  async function sendMessage(opts: {
    content: string;
    history: ChatMessage[];
    thread_id?: string;
    property_id?: string;
    onDelta: (chunk: string) => void;
    onDone: (full: string) => void;
  }) {
    setIsStreaming(true);
    const auth = await getAuthHeader();

    try {
      const resp = await fetch(RONIN_AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          type: "message",
          content: opts.content,
          messages: opts.history,
          thread_id: opts.thread_id,
          property_id: opts.property_id,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Network error" }));
        if (resp.status === 429) toast.error(data.error ?? "Rate limit exceeded.");
        else if (resp.status === 402) toast.error(data.error ?? "AI credits exhausted.");
        else toast.error(data.error ?? "Ronin AI error.");
        setIsStreaming(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) { full += chunk; opts.onDelta(chunk); }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      opts.onDone(full);
    } catch (e) {
      toast.error("Failed to reach Ronin AI.");
      console.error(e);
    } finally {
      setIsStreaming(false);
    }
  }

  /** Upload a CSV for the Master Import pipeline */
  async function importCSV(opts: {
    csvContent: string;
    propertyId?: string;
    threadId?: string;
    onResult: (result: { task_count: number; summary: string }) => void;
  }) {
    setIsStreaming(true);
    const auth = await getAuthHeader();

    try {
      const resp = await fetch(RONIN_AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          type: "csv_import",
          csv_content: opts.csvContent,
          property_id: opts.propertyId,
          thread_id: opts.threadId,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.error ?? "Import failed.");
        return;
      }
      opts.onResult({ task_count: data.task_count, summary: data.summary });
    } catch (e) {
      toast.error("Import request failed.");
      console.error(e);
    } finally {
      setIsStreaming(false);
    }
  }

  return { sendMessage, importCSV, isStreaming };
}
