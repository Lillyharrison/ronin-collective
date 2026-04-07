import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  Check, CheckCheck, Bot, Play, Pause, Trash2, CheckCircle, XCircle,
  Copy, Reply, Forward, Info, Star, MoreHorizontal, X, Share2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

/** Parse a forwarded WhatsApp message: `FWDWA::SenderName::actual content` */
function parseForwarded(text: string): { sender: string; body: string } | null {
  if (!text.startsWith("FWDWA::")) return null;
  const parts = text.slice(7).split("::");
  if (parts.length < 2) return null;
  return { sender: parts[0], body: parts.slice(1).join("::") };
}

/** Lazy-loaded image with a skeleton placeholder so layout doesn't jump */
function ImageWithSkeleton({ src, onClick }: { src: string; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <div
      className="relative rounded-xl overflow-hidden mb-1 cursor-pointer"
      style={{ minHeight: loaded ? undefined : "120px", maxWidth: "220px" }}
      onClick={onClick}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 bg-muted animate-pulse rounded-xl" style={{ minHeight: "120px" }} />
      )}
      <img
        src={src}
        alt=""
        className={`rounded-xl block w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ maxHeight: "260px", objectFit: "cover" }}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(true); setErrored(true); }}
      />
      {errored && (
        <div className="flex items-center justify-center p-4 text-xs text-muted-foreground bg-muted rounded-xl" style={{ minHeight: "80px" }}>
          📷 Image unavailable
        </div>
      )}
    </div>
  );
}

/** Turn plain URLs into clickable links */
function linkify(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s)<>]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match;
  let key = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[1];
    // Extract a friendly label from the domain
    let label = url;
    try {
      const host = new URL(url).hostname.replace("www.", "");
      if (host.includes("amazon")) label = "🛒 Shop on Amazon";
      else if (host.includes("walmart")) label = "🏬 Shop on Walmart";
      else if (host.includes("instacart")) label = "🥬 Shop on Instacart";
      else label = host;
    } catch { /* keep raw url */ }
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 break-all">
        {label}
      </a>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Render **bold**, *italic*, and `code` markdown inline, plus auto-link URLs */
function renderMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(...linkify(text.slice(last, match.index)));
    if (match[2]) parts.push(<strong key={`md${key++}`} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={`md${key++}`}>{match[3]}</em>);
    else if (match[4]) parts.push(<code key={`md${key++}`} className="text-[11px] bg-muted px-1 py-0.5 rounded font-mono">{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(...linkify(text.slice(last)));
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

/** Format seconds as M:SS */
function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Message = Tables<"messages"> & {
  sender_profile?: { full_name: string | null; avatar_url: string | null };
  is_starred?: boolean;
  audio_duration_sec?: number | null;
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  isAdmin?: boolean;
  onReact: (emoji: string) => void;
  onDelete?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onToggleStar?: (messageId: string, currentlyStarred: boolean) => void;
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
          {message.audio_duration_sec != null && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Duration</p>
              <p className="text-xs text-foreground">{formatDuration(message.audio_duration_sec)}</p>
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

/** Voice note player with real duration + live progress */
function VoiceNote({
  url,
  durationSec,
  isOwn,
}: {
  url: string;
  durationSec: number | null | undefined;
  isOwn: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(durationSec ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setTotalSec(audio.duration);
      }
    };
    audio.onended = () => {
      setPlaying(false);
      setCurrentSec(0);
      cancelAnimationFrame(rafRef.current);
    };

    return () => {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
    };
  }, [url]);

  const tick = () => {
    if (audioRef.current) setCurrentSec(audioRef.current.currentTime);
    rafRef.current = requestAnimationFrame(tick);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    } else {
      audio.play();
      rafRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  };

  const progress = totalSec > 0 ? currentSec / totalSec : 0;
  const displayTime = playing ? formatDuration(currentSec) : formatDuration(totalSec);
  const BAR_COUNT = 20;

  return (
    <button onClick={togglePlay} className="flex items-center gap-2 py-1 select-none">
      {playing
        ? <Pause size={16} className="flex-shrink-0" />
        : <Play size={16} className="flex-shrink-0" />}
      {/* Waveform bars — filled up to progress */}
      <div className="flex gap-0.5 items-end" style={{ height: "20px" }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const filled = i / BAR_COUNT <= progress;
          // Use a stable pseudo-random height seeded by index
          const h = 4 + ((i * 7 + 3) % 13);
          return (
            <div
              key={i}
              className={`w-0.5 rounded-full transition-colors`}
              style={{
                height: `${h}px`,
                backgroundColor: filled
                  ? "hsl(var(--accent))"
                  : isOwn ? "rgba(255,255,255,0.45)" : "hsl(var(--muted-foreground)/0.4)",
              }}
            />
          );
        })}
      </div>
      <span className="text-[10px] opacity-70 tabular-nums w-8 text-left">{displayTime}</span>
    </button>
  );
}

export function MessageBubble({
  message, isOwn, currentUserId, isAdmin,
  onReact, onDelete, onReply, onToggleStar, onConfirmTool, onCancelTool, quickEmojis,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number; flipDown?: boolean } | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [toolExecuted, setToolExecuted] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const time = format(new Date(message.created_at), "HH:mm");
  const isAI = message.is_ai_generated;
  const isRead = (message.seen_by ?? []).length > 0;
  const status = message.delivery_status as string;
  const canDelete = isOwn || isAdmin;
  // Use DB-persisted value — falls back gracefully for old rows
  const starred = (message as Message).is_starred ?? false;

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
      const menuHeight = 360;
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
      const fwd = parseForwarded(message.content_text);
      const toCopy = fwd ? fwd.body : message.content_text;
      navigator.clipboard.writeText(toCopy).catch(() => {});
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
    onToggleStar?.(message.id, starred);
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

      {/* ── Long-press context menu portal ─── */}
      {showMenu && menuPos && createPortal(
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[3px]"
            onClick={() => setShowMenu(false)}
          />
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
                    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onReact(emoji); setShowMenu(false); }}
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
              "rounded-2xl text-sm leading-relaxed select-none transition-transform active:scale-[0.97]",
              // Tighter padding for image-only messages
              message.media_type === "image" && !message.content_text ? "p-1" : "px-3 py-2",
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

            {/* Audio / voice note — real duration + live progress */}
            {message.media_type === "audio" && message.content_media_url && (
              <VoiceNote
                url={message.content_media_url}
                durationSec={(message as Message).audio_duration_sec}
                isOwn={isOwn}
              />
            )}

            {/* Text */}
            {message.content_text && (() => {
              const fwd = parseForwarded(message.content_text);
              if (fwd) {
                return (
                  <div>
                    {/* Forwarded header */}
                    <div className="flex items-center gap-1 mb-1 pb-1 border-b border-[hsl(25,100%,50%)]/25">
                      <Share2 size={11} className="text-[hsl(25,100%,50%)] flex-shrink-0" />
                      <span className="text-[10px] text-[hsl(25,100%,50%)] font-semibold uppercase tracking-wide truncate">
                        {fwd.sender} · WhatsApp
                      </span>
                    </div>
                    <span className="whitespace-pre-wrap">{fwd.body}</span>
                  </div>
                );
              }
              return isAI
                ? <RenderAIText text={message.content_text} />
                : <span className="whitespace-pre-wrap">{message.content_text}</span>;
            })()}

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
            <div className={cn(
              "flex items-center gap-1 mt-0.5",
              isOwn ? "justify-end" : "justify-start",
              message.media_type === "image" && !message.content_text && "px-2 pb-1"
            )}>
              <span className={`text-[9px] ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{time}</span>
              {isOwn && (() => {
                const isOptimistic = message.id.startsWith("optimistic-");
                const isReadMsg = status === "read" || isRead;
                if (isOptimistic) {
                  return <Check size={12} className="text-primary-foreground/50" />;
                } else if (isReadMsg) {
                  return <CheckCheck size={12} className="text-accent drop-shadow-sm" />;
                } else {
                  return <CheckCheck size={12} className="text-primary-foreground/60" />;
                }
              })()}
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
      onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
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
