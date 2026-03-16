import { useState, useRef, useCallback } from "react";
import { ThreadWithMeta } from "@/hooks/useThreads";
import { useLanguage } from "@/contexts/LanguageContext";
import { useThreadSettings } from "@/hooks/useThreadSettings";
import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { es, type Locale } from "date-fns/locale";
import { Bot, Users, Search, Plus, MessageCircle, Trash2, Pin, PinOff, BellOff, Bell, Archive, ArchiveRestore } from "lucide-react";
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

function formatThreadTime(dateStr: string, locale?: Locale): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return locale ? format(date, "EEEE", { locale }) : "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEEE", { locale });
  if (isThisYear(date)) return format(date, "dd/MM");
  return format(date, "dd/MM/yy");
}

const ACTION_WIDTH = 80; // px per action button

interface SwipeRowProps {
  thread: ThreadWithMeta;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  isActive: boolean;
  isAdmin?: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onPin: () => void;
  onMute: () => void;
  onArchive: () => void;
  onDeleteRequest: () => void;
  getAvatar: (t: ThreadWithMeta) => React.ReactNode;
  getThreadName: (t: ThreadWithMeta) => string;
  language: string;
  locale?: Locale;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
}

function SwipeRow({
  thread, isPinned, isMuted, isArchived, isActive, isAdmin, canDelete,
  onSelect, onPin, onMute, onArchive, onDeleteRequest,
  getAvatar, getThreadName, language, locale,
  openSwipeId, setOpenSwipeId,
}: SwipeRowProps) {
  const totalActionWidth = canDelete ? ACTION_WIDTH * 2 : ACTION_WIDTH;
  const isOpen = openSwipeId === thread.id;
  const offsetX = isOpen ? -totalActionWidth : 0;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isDragging = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [draggingOffset, setDraggingOffset] = useState<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Only hijack if horizontal movement dominates
    if (!isDragging.current && Math.abs(dx) < Math.abs(dy) && Math.abs(dy) > 5) return;
    if (Math.abs(dx) > 5) isDragging.current = true;
    if (!isDragging.current) return;

    e.preventDefault();
    const base = isOpen ? -totalActionWidth : 0;
    const raw = base + dx;
    // Clamp: can only swipe left up to full action width, no right past 0
    const clamped = Math.min(0, Math.max(-totalActionWidth, raw));
    setDraggingOffset(clamped);
  };

  const onTouchEnd = () => {
    if (!isDragging.current) return;
    const current = draggingOffset ?? (isOpen ? -totalActionWidth : 0);
    const threshold = totalActionWidth * 0.4;

    if (!isOpen && current < -threshold) {
      setOpenSwipeId(thread.id);
    } else if (isOpen && current > -(totalActionWidth - threshold)) {
      setOpenSwipeId(null);
    } else if (isOpen) {
      setOpenSwipeId(thread.id); // keep open
    } else {
      setOpenSwipeId(null);
    }
    setDraggingOffset(null);
  };

  const translateX = draggingOffset !== null ? draggingOffset : offsetX;

  return (
    <div className="relative overflow-hidden border-b border-border/50 flex-shrink-0">
      {/* Action buttons behind the row */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: totalActionWidth }}
      >
        {/* Pin button */}
        <button
          onClick={() => { onPin(); setOpenSwipeId(null); }}
          className="flex flex-col items-center justify-center gap-1 flex-1 bg-[hsl(var(--muted-foreground)/0.5)]"
          style={{ width: ACTION_WIDTH }}
        >
          {isPinned
            ? <PinOff size={22} className="text-white" />
            : <Pin size={22} className="text-white" />}
          <span className="text-[11px] text-white font-medium">
            {isPinned
              ? (language === "es" ? "Desanclar" : "Unpin")
              : (language === "es" ? "Anclar" : "Pin")}
          </span>
        </button>

        {/* Delete button — admin only */}
        {canDelete && (
          <button
            onClick={() => { onDeleteRequest(); setOpenSwipeId(null); }}
            className="flex flex-col items-center justify-center gap-1 flex-1 bg-destructive"
            style={{ width: ACTION_WIDTH }}
          >
            <Trash2 size={22} className="text-destructive-foreground" />
            <span className="text-[11px] text-destructive-foreground font-medium">
              {language === "es" ? "Eliminar" : "Delete"}
            </span>
          </button>
        )}
      </div>

      {/* Swipeable row */}
      <div
        ref={rowRef}
        className={`relative flex items-center transition-colors ${
          isActive ? "bg-accent/10" : "bg-background"
        } ${isPinned ? "bg-accent/5" : ""}`}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: draggingOffset !== null ? "none" : "transform 0.2s ease",
          willChange: "transform",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (isOpen) { setOpenSwipeId(null); return; }
          onSelect();
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 w-full min-w-0 overflow-hidden">
          {/* Avatar with pin indicator */}
          <div className="relative flex-shrink-0">
            {getAvatar(thread)}
            {isPinned && (
              <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                <Pin size={9} className="text-accent-foreground" />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 overflow-hidden">
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
        </div>
      </div>
    </div>
  );
}

export function ThreadList({
  threads, currentUserId, isAdmin, activeThreadId, onSelectThread, onNewChat,
  onDeleteThread, searchQuery, onSearchChange,
}: ThreadListProps) {
  const { language } = useLanguage();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    new Set(threads.filter(t => t.is_pinned).map(t => t.id))
  );
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const locale = language === "es" ? es : undefined;

  const getThreadName = useCallback((t: ThreadWithMeta) => {
    if (t.title) return t.title;
    if (t.type === "private") {
      const other = t.participants.find(p => p.id !== currentUserId);
      return other?.full_name || (language === "es" ? "Chat privado" : "Private chat");
    }
    return t.participants.map(p => p.full_name || "?").join(", ");
  }, [currentUserId, language]);

  const getAvatar = useCallback((t: ThreadWithMeta) => {
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
  }, [currentUserId]);

  const handleTogglePin = async (threadId: string) => {
    const nowPinned = !pinnedIds.has(threadId);
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (nowPinned) next.add(threadId); else next.delete(threadId);
      return next;
    });
    await supabase.from("chat_threads").update({ is_pinned: nowPinned } as never).eq("id", threadId);
  };

  const filtered = threads.filter(t =>
    !searchQuery || getThreadName(t).toLowerCase().includes(searchQuery.toLowerCase())
  );

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
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onClick={() => openSwipeId && setOpenSwipeId(null)}
      >
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageCircle size={40} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {language === "es" ? "No hay conversaciones aún" : "No conversations yet"}
            </p>
          </div>
        )}
        {sorted.map((thread) => (
          <SwipeRow
            key={thread.id}
            thread={thread}
            isPinned={pinnedIds.has(thread.id)}
            isActive={activeThreadId === thread.id}
            isAdmin={isAdmin}
            canDelete={!!onDeleteThread}
            onSelect={() => onSelectThread(thread.id)}
            onPin={() => handleTogglePin(thread.id)}
            onDeleteRequest={() => setConfirmDeleteId(thread.id)}
            getAvatar={getAvatar}
            getThreadName={getThreadName}
            language={language}
            locale={locale}
            openSwipeId={openSwipeId}
            setOpenSwipeId={setOpenSwipeId}
          />
        ))}
      </div>

      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "es" ? "¿Eliminar para mí?" : "Delete for me?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "es"
                ? `"${threadToDelete ? getThreadName(threadToDelete) : ""}" desaparecerá de tu lista. Los demás participantes no se verán afectados.`
                : `"${threadToDelete ? getThreadName(threadToDelete) : ""}" will be removed from your list. Other participants won't be affected.`}
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
                ? (language === "es" ? "Eliminando..." : "Removing...")
                : (language === "es" ? "Eliminar para mí" : "Delete for me")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
