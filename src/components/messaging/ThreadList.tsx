import { useState } from "react";
import { ThreadWithMeta } from "@/hooks/useThreads";
import { useLanguage } from "@/contexts/LanguageContext";
import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import { Bot, Users, Search, Plus, MessageCircle, Trash2, Pin, PinOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ThreadListProps {
  threads: ThreadWithMeta[];
  currentUserId: string;
  isAdmin?: boolean;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onDeleteThread?: (id: string) => Promise<boolean>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const AGENT_RONIN_LABEL = "Agent Ronin";

/** WhatsApp-style timestamp: time if today, day name if this week, DD/MM if this year, DD/MM/YY otherwise */
function formatThreadTime(dateStr: string, locale?: Locale): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return locale ? format(date, "EEEE", { locale }) : "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE", { locale });
  if (isThisYear(date)) return format(date, "dd/MM");
  return format(date, "dd/MM/yy");
}

export function ThreadList({
  threads, currentUserId, isAdmin, activeThreadId, onSelectThread, onNewChat,
  onDeleteThread, searchQuery, onSearchChange,
}: ThreadListProps) {
  const { language } = useLanguage();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Local optimistic pin state
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    new Set(threads.filter(t => (t as any).is_pinned).map(t => t.id))
  );

  const locale = language === "es" ? es : undefined;

  const getThreadName = (t: ThreadWithMeta) => {
    if (t.title) return t.title;
    if (t.type === "private") {
      const other = t.participants.find(p => p.id !== currentUserId);
      return other?.full_name || (language === "es" ? "Chat privado" : "Private chat");
    }
    return t.participants.map(p => p.full_name || "?").join(", ");
  };

  const getAvatar = (t: ThreadWithMeta) => {
    if (t.type === "group" || t.type === "property") {
      return (
        <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
          <Users size={20} className="text-accent" />
        </div>
      );
    }
    if (t.title === AGENT_RONIN_LABEL || t.type === "system_ai") {
      return (
        <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center flex-shrink-0">
          <Bot size={20} className="text-accent" />
        </div>
      );
    }
    const other = t.participants.find(p => p.id !== currentUserId);
    if (other?.avatar_url) {
      return <img src={other.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />;
    }
    const initials = (other?.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
    return (
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-semibold text-muted-foreground">{initials}</span>
      </div>
    );
  };

  const handleTogglePin = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    const nowPinned = !pinnedIds.has(threadId);
    // Optimistic update
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (nowPinned) next.add(threadId); else next.delete(threadId);
      return next;
    });
    await supabase.from("chat_threads").update({ is_pinned: nowPinned } as never).eq("id", threadId);
  };

  const filtered = threads.filter(t => {
    if (!searchQuery) return true;
    return getThreadName(t).toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Pinned first, then by last_message_at desc
  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 1 : 0;
    const bPinned = pinnedIds.has(b.id) ? 1 : 0;
    if (bPinned !== aPinned) return bPinned - aPinned;
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !onDeleteThread) return;
    setDeleting(true);
    await onDeleteThread(confirmDeleteId);
    setDeleting(false);
    setConfirmDeleteId(null);
  };

  const threadToDelete = confirmDeleteId ? threads.find(t => t.id === confirmDeleteId) : null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between flex-shrink-0">
        <h2 className="font-display text-xl text-foreground">
          {language === "es" ? "Mensajes" : "Messages"}
        </h2>
        <button
          onClick={onNewChat}
          className="w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors"
        >
          <Plus size={18} className="text-accent-foreground" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={language === "es" ? "Buscar..." : "Search..."}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageCircle size={40} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {language === "es" ? "No hay conversaciones aún" : "No conversations yet"}
            </p>
          </div>
        )}
        {sorted.map((thread) => {
          const isPinned = pinnedIds.has(thread.id);
          return (
            <div
              key={thread.id}
              className={`group relative flex items-center border-b border-border/50 transition-colors overflow-hidden ${
                activeThreadId === thread.id ? "bg-accent/10" : "hover:bg-muted/50"
              } ${isPinned ? "bg-accent/5" : ""}`}
            >
              <button
                onClick={() => onSelectThread(thread.id)}
                className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0 overflow-hidden"
              >
                {/* Avatar with optional pin indicator */}
                <div className="relative flex-shrink-0">
                  {getAvatar(thread)}
                  {isPinned && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                      <Pin size={9} className="text-accent-foreground" />
                    </div>
                  )}
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {/* Row 1: name + timestamp */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate leading-tight">
                      {getThreadName(thread)}
                    </span>
                    {thread.last_message_at && (
                      <span className={`text-[11px] whitespace-nowrap flex-shrink-0 leading-tight ${
                        thread.unread_count > 0 ? "text-accent font-medium" : "text-muted-foreground"
                      }`}>
                        {formatThreadTime(thread.last_message_at, locale)}
                      </span>
                    )}
                  </div>
                  {/* Row 2: message preview + unread badge */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1 min-w-0 leading-tight">
                      {thread.last_message
                        ? thread.last_message.split("\n")[0]
                        : (language === "es" ? "Sin mensajes" : "No messages yet")}
                    </p>
                    {thread.unread_count > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {thread.unread_count > 99 ? "99+" : thread.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* Action buttons — show on hover */}
              <div className="absolute right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Pin / unpin */}
                <button
                  onClick={(e) => handleTogglePin(e, thread.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                  title={isPinned
                    ? (language === "es" ? "Desanclar" : "Unpin")
                    : (language === "es" ? "Anclar" : "Pin")}
                >
                  {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                {/* Delete — admin only */}
                {isAdmin && onDeleteThread && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(thread.id); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    title={language === "es" ? "Eliminar chat" : "Delete chat"}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "es" ? "¿Eliminar conversación?" : "Delete conversation?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "es"
                ? `Esto eliminará "${threadToDelete ? getThreadName(threadToDelete) : ""}" y todos sus mensajes permanentemente.`
                : `This will permanently delete "${threadToDelete ? getThreadName(threadToDelete) : ""}" and all its messages.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? (language === "es" ? "Eliminando..." : "Deleting...")
                : (language === "es" ? "Eliminar" : "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
