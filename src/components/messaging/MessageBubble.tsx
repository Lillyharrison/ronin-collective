import { useState, useRef } from "react";
import { format } from "date-fns";
import { Check, CheckCheck, Bot, Play, Pause, Trash2, CheckCircle, XCircle, Copy } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

/** Render **bold**, *italic*, and `code` markdown inline */
function renderMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={key++} className="text-[11px] bg-muted px-1 py-0.5 rounded font-mono">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Render a full AI message with markdown line-by-line */
function RenderAIText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <span className="whitespace-pre-wrap">
      {lines.map((line, i) => (
        <span key={i}>
          {renderMarkdown(line)}
          {i < lines.length - 1 && "\n"}
        </span>
      ))}
    </span>
  );
}

type Message = Tables<"messages"> & { sender_profile?: { full_name: string | null; avatar_url: string | null } };

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  isAdmin?: boolean;
  onReact: (emoji: string) => void;
  onDelete?: (messageId: string) => void;
  onConfirmTool?: (toolName: string, toolArgs: Record<string, unknown>) => void;
  onCancelTool?: () => void;
  quickEmojis: string[];
}

const TOOL_LABELS: Record<string, string> = {
  send_staff_message: "Send Message",
  create_task: "Create Task",
  update_task_status: "Update Task",
  log_asset: "Log Asset",
};

export function MessageBubble({ message, isOwn, currentUserId, isAdmin, onReact, onDelete, onConfirmTool, onCancelTool, quickEmojis }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [toolExecuted, setToolExecuted] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const time = format(new Date(message.created_at), "HH:mm");
  const isAI = message.is_ai_generated;
  const isRead = (message.seen_by ?? []).length > 0;
  const status = message.delivery_status as string;
  const canDelete = isOwn || isAdmin;

  // Detect pending tool call stored in reactions field
  const reactions = message.reactions as Record<string, unknown> | null;
  const pendingTool = reactions?.__pending_tool as { name: string; args: Record<string, unknown> } | undefined;
  // Filter out __pending_tool from visible emoji reactions
  const emojiReactions = reactions
    ? Object.entries(reactions).filter(([key]) => key !== "__pending_tool")
    : [];

  const openMenu = () => {
    // Haptic feedback on mobile
    if (navigator.vibrate) navigator.vibrate(30);
    setShowMenu(true);
    suppressClick.current = true;
  };

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(openMenu, 420);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const toggleAudio = () => {
    if (!audioRef) {
      const a = new Audio(message.content_media_url!);
      a.onended = () => setAudioPlaying(false);
      a.play();
      setAudioRef(a);
      setAudioPlaying(true);
    } else if (audioPlaying) {
      audioRef.pause();
      setAudioPlaying(false);
    } else {
      audioRef.play();
      setAudioPlaying(true);
    }
  };

  const handleConfirm = () => {
    if (!pendingTool || toolExecuted) return;
    setToolExecuted(true);
    onConfirmTool?.(pendingTool.name, pendingTool.args);
  };

  const handleCancel = () => {
    if (toolExecuted) return;
    setToolExecuted(true);
    onCancelTool?.();
  };

  const handleCopy = () => {
    if (message.content_text) {
      navigator.clipboard.writeText(message.content_text).catch(() => {});
    }
    setShowMenu(false);
  };

  return (
    <div
      className={`flex mb-1 ${isOwn ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* AI avatar */}
      {isAI && (
        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mr-1.5 mt-auto mb-1 flex-shrink-0">
          <Bot size={12} className="text-accent" />
        </div>
      )}

      <div className="max-w-[78%] relative group">
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed select-none transition-transform active:scale-[0.97] ${
            isOwn
              ? "bg-[hsl(var(--status-done))] text-primary-foreground rounded-br-sm"
              : isAI
              ? "bg-card border-2 border-accent/30 text-foreground rounded-bl-sm"
              : "bg-card border border-border text-foreground rounded-bl-sm"
          }`}
        >
          {/* Sender name for groups */}
          {!isOwn && !isAI && message.sender_profile?.full_name && (
            <p className="text-[11px] font-semibold text-accent mb-0.5">
              {message.sender_profile.full_name}
            </p>
          )}

          {/* Image — with skeleton until loaded */}
          {message.media_type === "image" && message.content_media_url && (
            <ImageWithSkeleton
              src={message.content_media_url}
              onClick={() => window.open(message.content_media_url!, "_blank")}
            />
          )}

          {/* Audio / voice note */}
          {message.media_type === "audio" && message.content_media_url && (
            <button onClick={toggleAudio} className="flex items-center gap-2 py-1">
              {audioPlaying ? <Pause size={16} /> : <Play size={16} />}
              <div className="flex gap-0.5">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-0.5 rounded-full ${audioPlaying ? "bg-accent" : isOwn ? "bg-white/60" : "bg-muted-foreground/40"}`}
                    style={{ height: `${4 + Math.random() * 12}px` }}
                  />
                ))}
              </div>
              <span className="text-[10px] opacity-70">0:00</span>
            </button>
          )}

          {/* Text */}
          {message.content_text && (
            isAI
              ? <RenderAIText text={message.content_text} />
              : <span className="whitespace-pre-wrap">{message.content_text}</span>
          )}

          {/* Loading state for AI */}
          {isAI && !message.content_text && (
            <div className="flex gap-1 py-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          )}

          {/* ── Pending tool confirmation buttons ───────────────────────────── */}
          {pendingTool && !toolExecuted && (
            <div className="mt-3 pt-2 border-t border-accent/20">
              <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide font-medium">
                Action: {TOOL_LABELS[pendingTool.name] ?? pendingTool.name}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CheckCircle size={13} />
                  Confirm
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-muted/50 hover:bg-muted border border-border text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <XCircle size={13} />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Executed state */}
          {pendingTool && toolExecuted && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground italic">Action confirmed — executing…</p>
            </div>
          )}

          {/* Time + delivery status */}
          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
            <span className={`text-[9px] ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{time}</span>
            {isOwn && (
              status === "read" || isRead ? (
                <CheckCheck size={12} className="text-accent" />
              ) : (
                <Check size={12} className={isOwn ? "text-primary-foreground/70" : "text-muted-foreground"} />
              )
            )}
          </div>
        </div>

        {/* ── WhatsApp-style reaction + action overlay ─────────────────────── */}
        {showMenu && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setShowMenu(false)}
            />

            {/* Floating panel — anchored above the bubble */}
            <div
              className={`absolute ${isOwn ? "right-0" : "left-0"} bottom-full mb-2 z-50 flex flex-col gap-1.5`}
              style={{ minWidth: "max-content" }}
            >
              {/* Emoji reaction bar */}
              <div className="flex items-center gap-1 bg-card border border-border rounded-2xl shadow-xl px-3 py-2 animate-in zoom-in-95 fade-in duration-150">
                {quickEmojis.map((emoji, i) => {
                  const hasReacted = emojiReactions.find(([e]) => e === emoji)?.[1] as string[] | undefined;
                  const iReacted = hasReacted?.includes(currentUserId);
                  return (
                    <button
                      key={emoji}
                      onClick={() => { onReact(emoji); setShowMenu(false); }}
                      className={`text-xl w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 hover:scale-125 active:scale-110 ${
                        iReacted ? "bg-accent/20 ring-1 ring-accent scale-110" : "hover:bg-muted"
                      }`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              {/* Action menu */}
              <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150">
                {message.content_text && (
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Copy size={15} className="text-muted-foreground" />
                    Copy
                  </button>
                )}
                {canDelete && onDelete && (
                  <button
                    onClick={() => { onDelete(message.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border/50"
                  >
                    <Trash2 size={15} />
                    Delete message
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Emoji reactions display */}
        {emojiReactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
            {emojiReactions.map(([emoji, users]) => {
              const iReacted = (users as string[]).includes(currentUserId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  className={`text-xs rounded-full px-2 py-0.5 flex items-center gap-0.5 border transition-colors ${
                    iReacted
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-card border-border text-foreground"
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="text-[9px] font-medium">{(users as string[]).length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
