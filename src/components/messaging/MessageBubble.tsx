import { useState } from "react";
import { format } from "date-fns";
import { Check, CheckCheck, Bot, Play, Pause } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Message = Tables<"messages"> & { sender_profile?: { full_name: string | null; avatar_url: string | null } };

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  currentUserId: string;
  onReact: (emoji: string) => void;
  quickEmojis: string[];
}

export function MessageBubble({ message, isOwn, currentUserId, onReact, quickEmojis }: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);

  const time = format(new Date(message.created_at), "HH:mm");
  const isAI = message.is_ai_generated;
  const isRead = (message.seen_by ?? []).length > 0;
  const status = message.delivery_status as string;

  const handleLongPress = () => setShowReactions(true);

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

  return (
    <div
      className={`flex mb-1 ${isOwn ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}
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
            <button
              onClick={toggleAudio}
              className="flex items-center gap-2 py-1"
            >
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
            <span className="whitespace-pre-wrap">{message.content_text}</span>
          )}

          {/* Loading state for AI */}
          {isAI && !message.content_text && (
            <div className="flex gap-1 py-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
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

        {/* Reaction picker */}
        {showReactions && (
          <div
            className={`absolute ${isOwn ? "right-0" : "left-0"} -top-10 bg-card border border-border rounded-full px-2 py-1 flex gap-1 shadow-lg z-10`}
            onMouseLeave={() => setShowReactions(false)}
          >
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onReact(emoji); setShowReactions(false); }}
                className="text-base hover:scale-125 transition-transform px-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Displayed reactions */}
        {message.reactions && typeof message.reactions === "object" && Object.keys(message.reactions).length > 0 && (
          <div className={`flex gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
            {Object.entries(message.reactions as Record<string, string[]>).map(([emoji, users]) => (
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
