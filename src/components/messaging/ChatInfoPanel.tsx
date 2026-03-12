import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  X, Search, Image, Link2, FileText, Pencil, Check,
  Users, Bot, User, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Message {
  id: string;
  content_text: string | null;
  content_media_url: string | null;
  media_type: string | null;
  created_at: string;
  sender_id: string | null;
}

interface Participant {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  threadId: string;
  threadTitle: string;
  threadType: string;
  participants: Participant[];
  currentUserId: string;
  isAdmin?: boolean;
  isAgentThread?: boolean;
  onRenameGroup: (newName: string) => Promise<void>;
  onSearchOpen: () => void;
}

type Tab = "media" | "links" | "docs";

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function ChatInfoPanel({
  open, onClose, threadId, threadTitle, threadType, participants,
  currentUserId, isAdmin, isAgentThread, onRenameGroup, onSearchOpen,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("media");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(threadTitle);

  useEffect(() => {
    if (!open) return;
    setNewName(threadTitle);
    loadMessages();
  }, [open, threadId, threadTitle]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("id, content_text, content_media_url, media_type, created_at, sender_id")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(200);
    setMessages((data as Message[]) ?? []);
    setLoading(false);
  };

  const mediaMessages = messages.filter(m =>
    m.media_type === "image" && m.content_media_url
  );

  const linkMessages = messages.filter(m => {
    if (!m.content_text) return false;
    return URL_REGEX.test(m.content_text);
  });

  const docMessages = messages.filter(m =>
    m.media_type === "file" && m.content_media_url
  );

  const extractLinks = (text: string): string[] => {
    return Array.from(text.matchAll(new RegExp(URL_REGEX)) ?? []).map(m => m[0]);
  };

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === threadTitle) { setRenaming(false); return; }
    await onRenameGroup(trimmed);
    setRenaming(false);
  };

  const getParticipantName = (id: string | null) => {
    if (!id) return "Unknown";
    const p = participants.find(p => p.id === id);
    return p?.full_name ?? "Unknown";
  };

  const canRename = isAdmin && threadType === "group" && !isAgentThread;

  const getHeaderAvatar = () => {
    if (isAgentThread) return (
      <div className="w-16 h-16 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center">
        <Bot size={28} className="text-accent" />
      </div>
    );
    if (threadType === "group") return (
      <div className="w-16 h-16 rounded-full bg-accent/15 border-2 border-accent/30 flex items-center justify-center">
        <Users size={28} className="text-accent" />
      </div>
    );
    const other = participants.find(p => p.id !== currentUserId);
    if (other?.avatar_url) return (
      <img src={other.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-border" />
    );
    return (
      <div className="w-16 h-16 rounded-full bg-muted border-2 border-border flex items-center justify-center">
        <User size={28} className="text-muted-foreground" />
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel — slides in from right */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {threadType === "group" ? "Group Info" : "Chat Info"}
          </span>
          <div className="w-8" />
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Identity block */}
          <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-5 border-b border-border">
            {getHeaderAvatar()}

            {/* Editable name */}
            <div className="flex items-center gap-2">
              {renaming ? (
                <>
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
                    className="text-base font-semibold text-foreground bg-muted/50 border border-border rounded-lg px-3 py-1 outline-none focus:border-accent text-center"
                    style={{ fontSize: "16px", maxWidth: "200px" }}
                  />
                  <button
                    onClick={handleRename}
                    className="w-7 h-7 rounded-full bg-accent flex items-center justify-center"
                  >
                    <Check size={13} className="text-accent-foreground" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-foreground">{threadTitle}</p>
                  {canRename && (
                    <button
                      onClick={() => setRenaming(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {isAgentThread
                ? "AI Agent · Always available"
                : threadType === "group"
                ? `${participants.length} members`
                : "Direct message"}
            </p>
          </div>

          {/* ── Quick action rows ── */}
          <div className="border-b border-border">
            {/* Search */}
            <button
              onClick={() => { onClose(); onSearchOpen(); }}
              className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Search size={16} className="text-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1 text-left">Search</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>

            {/* Rename group — only for group chats + admins */}
            {canRename && (
              <button
                onClick={() => setRenaming(true)}
                className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors border-t border-border/50"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Pencil size={16} className="text-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground flex-1 text-left">Rename Group</span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>
            )}
          </div>

          {/* ── Participants (group only) ── */}
          {threadType === "group" && !isAgentThread && (
            <div className="border-b border-border">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground px-4 pt-4 pb-2">
                Members
              </p>
              {participants.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-sm text-foreground">{p.full_name ?? "Unknown"}</span>
                  {p.id === currentUserId && (
                    <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">You</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Media / Links / Docs tabs ── */}
          <div className="px-4 pt-4">
            <div className="flex gap-0 border-b border-border mb-4">
              {(["media", "links", "docs"] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 pb-2.5 text-xs font-semibold capitalize transition-colors border-b-2",
                    activeTab === tab
                      ? "text-foreground border-accent"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {tab === "media" && <Image size={13} className="inline mr-1 mb-0.5" />}
                  {tab === "links" && <Link2 size={13} className="inline mr-1 mb-0.5" />}
                  {tab === "docs" && <FileText size={13} className="inline mr-1 mb-0.5" />}
                  {tab}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              </div>
            ) : activeTab === "media" ? (
              mediaMessages.length === 0 ? (
                <EmptyState icon={<Image size={28} />} label="No media shared yet" />
              ) : (
                <div className="grid grid-cols-3 gap-1 pb-6">
                  {mediaMessages.map(m => (
                    <a
                      key={m.id}
                      href={m.content_media_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-muted"
                    >
                      <img
                        src={m.content_media_url!}
                        alt=""
                        className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )
            ) : activeTab === "links" ? (
              linkMessages.length === 0 ? (
                <EmptyState icon={<Link2 size={28} />} label="No links shared yet" />
              ) : (
                <div className="space-y-2 pb-6">
                  {linkMessages.map(m => {
                    const links = extractLinks(m.content_text!);
                    return links.map((url, i) => (
                      <a
                        key={`${m.id}-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Link2 size={14} className="text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-accent truncate group-hover:underline">{url}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {getParticipantName(m.sender_id)} · {format(new Date(m.created_at), "d MMM")}
                          </p>
                        </div>
                      </a>
                    ));
                  })}
                </div>
              )
            ) : (
              docMessages.length === 0 ? (
                <EmptyState icon={<FileText size={28} />} label="No documents shared yet" />
              ) : (
                <div className="space-y-2 pb-6">
                  {docMessages.map(m => {
                    const fileName = m.content_media_url?.split("/").pop() ?? "Document";
                    return (
                      <a
                        key={m.id}
                        href={m.content_media_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-accent" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {getParticipantName(m.sender_id)} · {format(new Date(m.created_at), "d MMM")}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/40">
      {icon}
      <p className="text-xs text-muted-foreground/60">{label}</p>
    </div>
  );
}
