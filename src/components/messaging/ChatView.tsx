import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMessages } from "@/hooks/useMessages";
import { supabase } from "@/integrations/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Send, Loader2, Camera, Mic, MicOff,
  Users, Bot, User, Plus, Image, ScanSearch, Smile,
} from "lucide-react";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";

interface ChatViewProps {
  threadId: string;
  threadTitle: string;
  threadType: string;
  participants: { id: string; full_name: string | null; avatar_url: string | null }[];
  currentUserId: string;
  isAdmin?: boolean;
  onBack: () => void;
  isAgentThread?: boolean;
}

export function ChatView({
  threadId, threadTitle, threadType, participants, currentUserId, isAdmin, onBack, isAgentThread,
}: ChatViewProps) {
  const { language } = useLanguage();
  const { messages, loading, sendMessage, sendMediaMessage, markAsRead, toggleReaction, deleteMessage } = useMessages(threadId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [agentAnalyzing, setAgentAnalyzing] = useState(false);
  const visionInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (currentUserId && messages.length > 0) {
      markAsRead(currentUserId);
    }
  }, [messages.length, currentUserId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showEmoji || showAttachMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmoji, showAttachMenu]);

  const getAuthHeader = async () => {
    const { data: session } = await supabase.auth.getSession();
    return session?.session
      ? `Bearer ${session.session.access_token}`
      : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    if (isAgentThread) {
      const lastAiMsg = [...messages].reverse().find(m => m.is_ai_generated);
      const pendingTool = (lastAiMsg?.reactions as Record<string, unknown> | null)?.__pending_tool as
        { name: string; args: Record<string, unknown> } | undefined;

      const isConfirmation = pendingTool && /^(yes|si|sí|proceed|confirm|do it|go ahead|adelante|hazlo|confirmar)/i.test(text);
      const isCancellation = pendingTool && /^(no|cancel|cancelar|stop|nevermind|don't)/i.test(text);

      await sendMessage(text, currentUserId);
      setAgentTyping(true);

      try {
        const auth = await getAuthHeader();
        if (isConfirmation && pendingTool) {
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ action: "execute_tool", tool_name: pendingTool.name, tool_args: pendingTool.args, thread_id: threadId }),
          });
          if (!resp.ok) console.error("Tool execution failed:", await resp.text());
        } else if (isCancellation && pendingTool) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({
              type: "message",
              content: text,
              messages: messages.filter(m => m.content_text && !m.content_text.startsWith("ACT:")).slice(-20).map(m => ({
                role: m.is_ai_generated ? "assistant" as const : "user" as const,
                content: m.content_text!,
              })),
              thread_id: threadId,
            }),
          });
        } else {
          const history = messages
            .filter(m => m.content_text && !m.content_text.startsWith("ACT:") && !m.content_text.startsWith("RESPOND:"))
            .slice(-20)
            .map(m => ({ role: m.is_ai_generated ? "assistant" as const : "user" as const, content: m.content_text! }));
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ type: "message", content: text, messages: history, thread_id: threadId }),
          });
        }
      } catch (e) {
        console.error("AI error:", e);
      } finally {
        setAgentTyping(false);
      }
    } else {
      await sendMessage(text, currentUserId);
    }
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    const path = `${currentUserId}/${Date.now()}_${file.name}`;
    const { data: uploaded } = await supabase.storage.from("chat-media").upload(path, file);
    if (uploaded) {
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(uploaded.path);
      await sendMediaMessage(urlData.publicUrl, file.type.startsWith("image") ? "image" : "file", currentUserId);
    }
    setSending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleVisionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image")) return;
    const captionText = input.trim();
    setInput("");

    // 1. Show image immediately using a local blob URL so the UI feels instant
    const localBlobUrl = URL.createObjectURL(file);
    await sendMediaMessage(localBlobUrl, "image", currentUserId);
    if (captionText) await sendMessage(captionText, currentUserId);

    setAgentAnalyzing(true);

    // 2. Upload in background — don't block UI on storage round-trip
    try {
      const path = `${currentUserId}/${Date.now()}_vision_${file.name}`;
      const { data: uploaded, error: uploadErr } = await supabase.storage.from("chat-media").upload(path, file);
      if (uploadErr || !uploaded) {
        console.error("Vision upload error:", uploadErr);
        setAgentAnalyzing(false);
        if (visionInputRef.current) visionInputRef.current.value = "";
        return;
      }
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(uploaded.path);
      const publicUrl = urlData.publicUrl;

      // 3. Call Ronin AI with the real public URL
      const auth = await getAuthHeader();
      const visionPrompt = captionText || "Please analyse this image and help me log it to the estate inventory.";
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ type: "message", content: visionPrompt, image_url: publicUrl, thread_id: threadId }),
      });
    } catch (err) {
      console.error("Vision analysis error:", err);
    } finally {
      setAgentAnalyzing(false);
      URL.revokeObjectURL(localBlobUrl);
    }
    if (visionInputRef.current) visionInputRef.current.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setSending(true);
        const path = `${currentUserId}/${Date.now()}_voice.webm`;
        const { data: uploaded } = await supabase.storage.from("chat-media").upload(path, blob);
        if (uploaded) {
          const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(uploaded.path);
          await sendMediaMessage(urlData.publicUrl, "audio", currentUserId);
        }
        setSending(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      console.error("Mic access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const groupedMessages: { date: string; msgs: typeof messages }[] = [];
  let lastDateStr = "";
  for (const msg of messages) {
    const d = new Date(msg.created_at);
    const dateStr = format(d, "yyyy-MM-dd");
    if (dateStr !== lastDateStr) {
      groupedMessages.push({ date: dateStr, msgs: [] });
      lastDateStr = dateStr;
    }
    groupedMessages[groupedMessages.length - 1].msgs.push(msg);
  }

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isToday(d)) return language === "es" ? "Hoy" : "Today";
    if (isYesterday(d)) return language === "es" ? "Ayer" : "Yesterday";
    return format(d, "d MMM yyyy", { locale: language === "es" ? es : undefined });
  };

  const EMOJI_QUICK = ["👍", "❤️", "😂", "😮", "🙏", "🔥"];

  const getHeaderAvatar = () => {
    if (isAgentThread) {
      return (
        <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
          <Bot size={16} className="text-accent" />
        </div>
      );
    }
    if (threadType === "group") {
      return (
        <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Users size={16} className="text-accent" />
        </div>
      );
    }
    const other = participants.find(p => p.id !== currentUserId);
    if (other?.avatar_url) {
      return <img src={other.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />;
    }
    return (
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
        <User size={16} className="text-muted-foreground" />
      </div>
    );
  };

  const hasText = input.trim().length > 0;

  // Heights: app header = 3.5rem (56px), chat sub-header ≈ 3.25rem (52px), input bar ≈ 3.5rem (56px)
  const CHAT_HEADER_TOP = "top-14"; // sits directly below the fixed app header
  const CHAT_HEADER_H = "h-[52px]";
  const INPUT_BAR_H = "h-[60px]";

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky chat sub-header — stays pinned inside the flex column ── */}
      <div className={`flex-shrink-0 ${CHAT_HEADER_H} z-40 px-3 border-b border-border bg-card flex items-center gap-3`}>
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        {getHeaderAvatar()}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{threadTitle}</p>
          <p className="text-[10px] text-muted-foreground">
            {isAgentThread
              ? (language === "es" ? "Agente IA · En línea" : "AI Agent · Online")
              : threadType === "group"
              ? `${participants.length} ${language === "es" ? "miembros" : "members"}`
              : (language === "es" ? "En línea" : "Online")}
          </p>
        </div>
      </div>

      {/* Messages area — fills remaining flex space, scrolls independently */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-1 min-h-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")"
        }}
      >
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {groupedMessages.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center my-3">
              <span className="text-[10px] text-muted-foreground bg-card/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50">
                {formatDateLabel(group.date)}
              </span>
            </div>
            {group.msgs.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender_id === currentUserId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onReact={(emoji) => toggleReaction(msg.id, currentUserId, emoji)}
                onDelete={(id) => deleteMessage(id)}
                onConfirmTool={async (toolName, toolArgs) => {
                  setAgentTyping(true);
                  try {
                    const auth = await getAuthHeader();
                    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: auth },
                      body: JSON.stringify({ action: "execute_tool", tool_name: toolName, tool_args: toolArgs, thread_id: threadId }),
                    });
                  } catch (e) { console.error("Tool confirm error:", e); }
                  finally { setAgentTyping(false); }
                }}
                onCancelTool={async () => {
                  setAgentTyping(true);
                  try {
                    const auth = await getAuthHeader();
                    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ronin-ai`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: auth },
                      body: JSON.stringify({ type: "message", content: "Cancel that action please.", messages: [], thread_id: threadId }),
                    });
                  } catch (e) { console.error("Tool cancel error:", e); }
                  finally { setAgentTyping(false); }
                }}
                quickEmojis={EMOJI_QUICK}
              />
            ))}
          </div>
        ))}
        {(agentTyping || agentAnalyzing) && (
          <div className="flex items-end gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px]">{agentAnalyzing ? "🔍" : "🧠"}</span>
            </div>
            <div className="bg-card border border-accent/30 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              {agentAnalyzing ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-accent" />
                  <span className="text-xs text-muted-foreground">
                    {language === "es" ? "Analizando imagen..." : "Analysing image..."}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {language === "es" ? "Razonando..." : "Reasoning..."}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Fixed input bar — always pinned to bottom of viewport ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border px-2 py-2 safe-area-pb" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {/* Emoji picker */}
        {showEmoji && (
          <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-1 z-50">
            <EmojiPicker
              theme={"dark" as Theme}
              onEmojiClick={(data: EmojiClickData) => {
                setInput(prev => prev + data.emoji);
                setShowEmoji(false);
              }}
              width={320}
              height={380}
            />
          </div>
        )}

        {/* Attach menu pop-up */}
        {showAttachMenu && (
          <div ref={attachMenuRef} className="absolute bottom-full left-2 mb-2 z-50 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors text-sm text-foreground"
            >
              <Image size={18} className="text-accent" />
              {language === "es" ? "Foto o video" : "Photo or video"}
            </button>
            {isAgentThread && (
              <button
                onClick={() => { visionInputRef.current?.click(); setShowAttachMenu(false); }}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted transition-colors text-sm text-foreground border-t border-border"
              >
                <ScanSearch size={18} className="text-accent" />
                {language === "es" ? "Análisis de inventario" : "Inventory analysis"}
              </button>
            )}
          </div>
        )}

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleImageUpload} />
        <input ref={visionInputRef} type="file" accept="image/*" className="hidden" onChange={handleVisionUpload} />
        {/* Camera capture input */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} />

        <div className="flex items-center gap-1.5">
          {/* + attach button */}
          <button
            onClick={() => setShowAttachMenu(v => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <Plus size={22} />
          </button>

          {/* Text input pill with emoji inside */}
          <div className="flex-1 flex items-center gap-1 bg-background border border-border rounded-full px-3 py-2 min-w-0">
            <button
              onClick={() => setShowEmoji(v => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <Smile size={18} />
            </button>
            <input
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-1 min-w-0"
              style={{ fontSize: "16px" }}
              placeholder={
                isAgentThread
                  ? (language === "es" ? "Pregunta a Ronin..." : "Ask Ronin...")
                  : (language === "es" ? "Escribe un mensaje..." : "Type a message...")
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              disabled={sending || recording || agentAnalyzing}
            />
          </div>

          {/* Camera button — always visible when no text */}
          {!hasText && (
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            >
              <Camera size={20} />
            </button>
          )}

          {/* Send (when text) or Mic (when no text) */}
          {hasText ? (
            <button
              onClick={handleSend}
              disabled={sending || agentAnalyzing}
              className="w-9 h-9 rounded-full bg-accent flex items-center justify-center disabled:opacity-50 transition-opacity flex-shrink-0"
            >
              {sending
                ? <Loader2 size={16} className="text-accent-foreground animate-spin" />
                : <Send size={16} className="text-accent-foreground" />
              }
            </button>
          ) : (
            <button
              onMouseDown={recording ? stopRecording : startRecording}
              disabled={agentAnalyzing}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0 ${
                recording
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
