import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRoninAI, ChatMessage } from "@/hooks/useRoninAI";
import { Send, Bot, Loader2, Sparkles } from "lucide-react";

export function MessagesSection() {
  const { language } = useLanguage();
  const { sendMessage, isStreaming } = useRoninAI();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [propertyId, setPropertyId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load the user's first assigned property for context
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("assigned_property_ids")
        .eq("id", data.session.user.id)
        .single();
      if (profile?.assigned_property_ids?.[0]) {
        setPropertyId(profile.assigned_property_ids[0]);
      }
    });
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Placeholder for streaming assistant response
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    await sendMessage({
      content: text,
      history: messages,
      property_id: propertyId,
      onDelta: (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      },
      onDone: () => {},
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center">
          <Bot size={18} className="text-gold" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">Ronin AI</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-status-done animate-pulse" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {language === "es" ? "En línea · Agente Activo" : "Online · Agent Active"}
            </span>
          </div>
        </div>
        <Sparkles size={14} className="text-gold ml-auto" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
              <Bot size={32} className="text-gold" />
            </div>
            <div>
              <p className="font-display text-lg text-foreground">
                {language === "es" ? "Hola, soy Ronin AI" : "Hi, I'm Ronin AI"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                {language === "es"
                  ? "Tu agente inteligente de gestión de propiedades. ¿Cómo puedo ayudarte hoy?"
                  : "Your intelligent estate operations agent. How can I help you today?"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {[
                language === "es" ? "¿Cuáles son mis tareas pendientes?" : "What are my pending tasks?",
                language === "es" ? "Muéstrame los problemas de mantenimiento" : "Show me open maintenance issues",
                language === "es" ? "Resume la actividad de hoy" : "Summarize today's activity",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInput(prompt)}
                  className="text-left text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2 hover:border-gold/40 hover:text-foreground transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                <Bot size={13} className="text-gold" />
              </div>
            )}
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gold text-charcoal font-medium rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" && msg.content === "" ? (
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-card">
        <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-4 py-2.5">
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={language === "es" ? "Pregunta a Ronin AI…" : "Ask Ronin AI…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            {isStreaming ? (
              <Loader2 size={14} className="text-charcoal animate-spin" />
            ) : (
              <Send size={14} className="text-charcoal" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5 tracking-wide">
          {language === "es" ? "Ronin AI tiene acceso al sistema completo" : "Ronin AI has full system access"}
        </p>
      </div>
    </div>
  );
}
