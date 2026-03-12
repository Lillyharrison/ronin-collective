import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  Check, CheckCheck, Bot, Play, Pause, Trash2, CheckCircle, XCircle,
  Copy, Reply, Forward, Info, Star, MoreHorizontal, X,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

/** Lazy-loaded image with a skeleton placeholder so layout doesn't jump */
function ImageWithSkeleton({ src, onClick }: { src: string; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative rounded-lg overflow-hidden mb-1 cursor-pointer max-w-full" style={{ minHeight: loaded ? undefined : "120px" }} onClick={onClick}>
      {!loaded && !errored && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-lg" />
      )}
      <img
        src={src}
        alt=""
        className={`rounded-lg max-w-full block transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(true); setErrored(true); }}
      />
      {errored && (
        <div className="flex items-center justify-center p-4 text-xs text-muted-foreground bg-muted rounded-lg" style={{ minHeight: "80px" }}>
          📷 Image unavailable
        </div>
      )}
    </div>
  );
}

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
  onReply?: (message: Message) => void;
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

/** Message Info modal */
function MessageInfoModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const sentAt = format(new Date(message.created_at), "d MMM yyyy, HH:mm:ss");
  const seenBy = message.seen_by ?? [];
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Message Info</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {message.content_text && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Content</p>
              <p className="text-sm text-foreground line-clamp-4 bg-muted/40 rounded-lg px-3 py-2">
                {message.content_text}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Sent</p>
              <p className="text-xs text-foreground">{sentAt}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Status</p>
              <p className="text-xs text-foreground capitalize">{message.delivery_status}</p>
            </div>
          </div>
          {seenBy.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Read by</p>
              <p className="text-xs text-foreground">{seenBy.length} {seenBy.length === 1 ? "person" : "people"}</p>
            </div>
          )}
          {message.media_type && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Type</p>
              <p className="text-xs text-foreground capitalize">{message.media_type}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function MessageBubble({ message, isOwn, currentUserId, isAdmin, onReact, onDelete, onReply, onConfirmTool, onCancelTool, quickEmojis }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number; flipDown?: boolean } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [starred, setStarred] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [toolExecuted, setToolExecuted] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const time = format(new Date(message.created_at), "HH:mm");
  const isAI = message.is_ai_generated;
  const isRead = (message.seen_by ?? []).length > 0;
  const status = message.delivery_status as string;
  const canDelete = isOwn || isAdmin;

  const reactions = message.reactions as Record<string, unknown> | null;
  const pendingTool = reactions?.__pending_tool as { name: string; args: Record<string, unknown> } | undefined;
  const emojiReactions = reactions
    ? Object.entries(reactions).filter(([key]) => key !== "__pending_tool")
    : [];

  const openMenu = () => {
    if (navigator.vibrate) navigator.vibrate(30);
    suppressClick.current = true;
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const menuHeight = 360; // approx max height of menu
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipDown = spaceAbove < menuHeight && spaceBelow > spaceAbove;
      const pos: typeof menuPos = {
        flipDown,
        top: flipDown ? rect.bottom + 8 : rect.top - 8,
      };
      if (isOwn) {
        pos.right = window.innerWidth - rect.right;
      } else {
        pos.left = rect.left;
      }
      setMenuPos(pos);
    }
    setShowMenu(true);
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

  const handleForward = () => {
    if (message.content_text) {
      navigator.clipboard.writeText(message.content_text).catch(() => {});
    }
    setShowMenu(false);
  };

  const handleReply = () => {
    onReply?.(message);
    setShowMenu(false);
  };

  const handleStar = () => {
    setStarred(v => !v);
    setShowMenu(false);
  };

  const handleInfo = () => {
    setShowMenu(false);
    setShowInfoModal(true);
  };

  return (
    <>
      {showInfoModal && (
        <MessageInfoModal message={message} onClose={() => setShowInfoModal(false)} />
      )}

      {/* ── Long-press context menu portal — renders above all content ─── */}
      {showMenu && menuPos && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[3px]"
            onClick={() => setShowMenu(false)}
          />

          {/* Floating menu — positioned via measured rect, flips if near top */}
          <div
            className="fixed z-[100] flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150"
            style={{
              minWidth: "220px",
              maxWidth: "280px",
              ...(menuPos.flipDown
                ? { top: menuPos.top }
                : { bottom: window.innerHeight - menuPos.top }),
              ...(menuPos.left !== undefined ? { left: Math.max(8, menuPos.left) } : {}),
              ...(menuPos.right !== undefined ? { right: Math.max(8, menuPos.right) } : {}),
            }}
          >
            {/* Emoji reaction bar */}
            <div className="flex items-center gap-1 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl px-3 py-2">
              {quickEmojis.map((emoji, i) => {
                const hasReacted = emojiReactions.find(([e]) => e === emoji)?.[1] as string[] | undefined;
                const iReacted = hasReacted?.includes(currentUserId);
                return (
                  <button
                    key={emoji}
                    onClick={() => { onReact(emoji); setShowMenu(false); }}
                    className={cn(
                      "text-xl w-9 h-9 flex items-center justify-center rounded-full transition-all duration-150 hover:scale-125 active:scale-110",
                      iReacted ? "bg-accent/20 ring-1 ring-accent scale-110" : "hover:bg-muted"
                    )}
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    {emoji}
                  </button>
                );
              })}
              <button className="w-9 h-9 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Action list */}
            <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden">
              <ActionRow
                icon={<Reply size={16} className="text-muted-foreground" />}
                label="Reply"
                onClick={handleReply}
              />
              <ActionRow
                icon={<Forward size={16} className="text-muted-foreground" />}
                label="Forward"
                onClick={handleForward}
                divider
              />
              {message.content_text && (
                <ActionRow
                  icon={<Copy size={16} className="text-muted-foreground" />}
                  label="Copy"
                  onClick={handleCopy}
                  divider
                />
              )}
              <ActionRow
                icon={<Info size={16} className="text-muted-foreground" />}
                label="Info"
                onClick={handleInfo}
                divider
              />
              <ActionRow
                icon={<Star size={16} className={starred ? "text-[hsl(var(--gold))] fill-[hsl(var(--gold))]" : "text-muted-foreground"} />}
                label={starred ? "Unstar" : "Star"}
                onClick={handleStar}
                divider
              />
              {canDelete && onDelete && (
                <ActionRow
                  icon={<Trash2 size={16} className="text-destructive" />}
                  label="Delete"
                  onClick={() => { onDelete(message.id); setShowMenu(false); }}
                  divider
                  danger
                />
              )}
            </div>
          </div>
        </>,
        document.body
      )}

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

        <div className="max-w-[78%] relative group" ref={bubbleRef}>
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed select-none transition-transform active:scale-[0.97]",
              isOwn
                ? "bg-[hsl(var(--status-done))] text-primary-foreground rounded-br-sm"
                : isAI
                ? "bg-card border-2 border-accent/30 text-foreground rounded-bl-sm"
                : "bg-card border border-border text-foreground rounded-bl-sm",
              starred && "ring-2 ring-[hsl(var(--gold))] ring-offset-1 ring-offset-background"
            )}
          >
            {/* Sender name for groups */}
            {!isOwn && !isAI && message.sender_profile?.full_name && (
              <p className="text-[11px] font-semibold text-accent mb-0.5">
                {message.sender_profile.full_name}
              </p>
            )}

            {/* Starred badge */}
            {starred && (
              <span className="absolute -top-2 -right-1 text-[hsl(var(--gold))] text-xs">⭐</span>
            )}

            {/* Image */}
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

            {/* Pending tool confirmation */}
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

          {/* Emoji reactions display */}
          {emojiReactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
              {emojiReactions.map(([emoji, users]) => {
                const iReacted = (users as string[]).includes(currentUserId);
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact(emoji)}
                    className={cn(
                      "text-xs rounded-full px-2 py-0.5 flex items-center gap-0.5 border transition-colors",
                      iReacted
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-card border-border text-foreground"
                    )}
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
    </>
  );
}

function ActionRow({
  icon, label, onClick, divider, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  divider?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3.5 text-sm transition-colors",
        divider && "border-t border-border/50",
        danger
          ? "text-destructive hover:bg-destructive/8"
          : "text-foreground hover:bg-muted/60"
      )}
    >
      <span className="font-medium">{label}</span>
      {icon}
    </button>
  );
}
