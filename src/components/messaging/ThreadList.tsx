import { ThreadWithMeta } from "@/hooks/useThreads";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Bot, Users, User, Search, Plus, MessageCircle } from "lucide-react";

interface ThreadListProps {
  threads: ThreadWithMeta[];
  currentUserId: string;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

const AGENT_RONIN_LABEL = "Agent Ronin";

export function ThreadList({
  threads, currentUserId, activeThreadId, onSelectThread, onNewChat, searchQuery, onSearchChange,
}: ThreadListProps) {
  const { language } = useLanguage();

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

  return (
    <div className="flex flex-col h-full">
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
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 ${
              activeThreadId === thread.id
                ? "bg-accent/10"
                : "hover:bg-muted/50"
            }`}
          >
            {getAvatar(thread)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground truncate">{getThreadName(thread)}</span>
                {thread.last_message_at && (
                  <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                    {formatDistanceToNow(new Date(thread.last_message_at), {
                      addSuffix: false,
                      locale: language === "es" ? es : undefined,
                    })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-muted-foreground truncate">
                  {thread.last_message || (language === "es" ? "Sin mensajes" : "No messages yet")}
                </p>
                {thread.unread_count > 0 && (
                  <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                    {thread.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
