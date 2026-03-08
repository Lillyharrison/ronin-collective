import { useState } from "react";
import { ThreadWithMeta } from "@/hooks/useThreads";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bot, Users, User, Search, Plus, MessageCircle, Trash2 } from "lucide-react";
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

export function ThreadList({
  threads, currentUserId, isAdmin, activeThreadId, onSelectThread, onNewChat,
  onDeleteThread, searchQuery, onSearchChange,
}: ThreadListProps) {
  const { language } = useLanguage();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const filtered = threads.filter(t => {
    if (!searchQuery) return true;
    const name = getThreadName(t).toLowerCase();
    return name.includes(searchQuery.toLowerCase());
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
      <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between">
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
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={language === "es" ? "Buscar..." : "Search..."}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageCircle size={40} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {language === "es" ? "No hay conversaciones aún" : "No conversations yet"}
            </p>
          </div>
        )}
        {filtered.map((thread) => (
          <div
            key={thread.id}
            className={`group relative flex items-center border-b border-border/50 transition-colors ${
              activeThreadId === thread.id ? "bg-accent/10" : "hover:bg-muted/50"
            }`}
          >
            <button
              onClick={() => onSelectThread(thread.id)}
              className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0 overflow-hidden"
            >
              {getAvatar(thread)}
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{getThreadName(thread)}</span>
                  {thread.last_message_at && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {formatDistanceToNow(new Date(thread.last_message_at), {
                        addSuffix: false,
                        locale: language === "es" ? es : undefined,
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                    {thread.last_message
                      ? thread.last_message.split("\n")[0]
                      : (language === "es" ? "Sin mensajes" : "No messages yet")}
                  </p>
                  {thread.unread_count > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                      {thread.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Delete button — master_admin only, shows on hover */}
            {isAdmin && onDeleteThread && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(thread.id); }}
                className="absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10"
                title={language === "es" ? "Eliminar chat" : "Delete chat"}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
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
                ? `Esto eliminará "${threadToDelete ? getThreadName(threadToDelete) : ""}" y todos sus mensajes permanentemente para todos los participantes.`
                : `This will permanently delete "${threadToDelete ? getThreadName(threadToDelete) : ""}" and all its messages for all participants.`}
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
