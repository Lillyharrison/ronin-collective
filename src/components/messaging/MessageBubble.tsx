import { useState } from "react";
import { format } from "date-fns";
import { Check, CheckCheck, Bot, Play, Pause, Trash2, CheckCircle, XCircle } from "lucide-react";
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

  return (
    <div
      className={`flex mb-1 ${isOwn ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
    >
      {/* AI avatar */}
      {isAI && (
        <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center mr-1.5 mt-auto mb-1 flex-shrink-0">
          <Bot size={12} className="text-accent" />
        </div>
      )}

      <div className="max-w-[78%] relative group">
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
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

          {/* Image */}
          {message.media_type === "image" && message.content_media_url && (
            <img
              src={message.content_media_url}
              alt=""
              className="rounded-lg max-w-full mb-1 cursor-pointer"
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

        {/* Context menu (long-press / right-click) */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
            <div
              className={`absolute ${isOwn ? "right-0" : "left-0"} -top-2 translate-y-[-100%] bg-card border border-border rounded-xl shadow-lg z-30 py-1 min-w-[140px]`}
            >
              {/* Emoji reactions row */}
              <div className="flex gap-1 px-2 py-1.5 border-b border-border">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(emoji); setShowMenu(false); }}
                    className="text-base hover:scale-125 transition-transform px-0.5"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {/* Delete option */}
              {canDelete && onDelete && (
                <button
                  onClick={() => { onDelete(message.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete message
                </button>
              )}
            </div>
          </>
        )}

        {/* Emoji reactions (excluding __pending_tool) */}
        {emojiReactions.length > 0 && (
          <div className={`flex gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
            {emojiReactions.map(([emoji, users]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className="text-xs bg-card border border-border rounded-full px-1.5 py-0.5 flex items-center gap-0.5"
              >
                <span>{emoji}</span>
                <span className="text-[9px] text-muted-foreground">{(users as string[]).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
