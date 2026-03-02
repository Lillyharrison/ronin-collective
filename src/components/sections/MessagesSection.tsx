import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePresence } from "@/hooks/usePresence";
import { useThreads } from "@/hooks/useThreads";
import { ThreadList } from "@/components/messaging/ThreadList";
import { ChatView } from "@/components/messaging/ChatView";
import { AddressBook } from "@/components/messaging/AddressBook";

type View = "threads" | "chat" | "address-book";

const AGENT_RONIN_TITLE = "Agent Ronin";

export function MessagesSection() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { level, userId } = usePermissions();
  const [view, setView] = useState<View>("threads");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = user?.id ?? null;
  usePresence(currentUserId);

  const { threads, loading, createDM, createGroup } = useThreads(currentUserId);

  const activeThread = threads.find(t => t.id === activeThreadId);

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
    setView("chat");
  };

  const handleBack = () => {
    setActiveThreadId(null);
    setView("threads");
  };

  const handleStartDM = async (contactId: string) => {
    if (!currentUserId) return;

    if (contactId === "agent-ronin") {
      // Find or create AI thread
      const existing = threads.find(t => t.type === "system_ai" || t.title === AGENT_RONIN_TITLE);
      if (existing) {
        setActiveThreadId(existing.id);
        setView("chat");
        return;
      }
      // Create system_ai thread
      const { data } = await supabase
        .from("chat_threads")
        .insert({
          type: "system_ai",
          title: AGENT_RONIN_TITLE,
          participant_ids: [currentUserId],
          created_by: currentUserId,
        })
        .select("id")
        .single();
      if (data) {
        setActiveThreadId(data.id);
        setView("chat");
      }
      return;
    }

    const threadId = await createDM(contactId);
    if (threadId) {
      setActiveThreadId(threadId);
      setView("chat");
    }
  };

  const handleCreateGroup = async (name: string, participantIds: string[]) => {
    const threadId = await createGroup(name, participantIds);
    if (threadId) {
      setActiveThreadId(threadId);
      setView("chat");
    }
  };

  if (!currentUserId) return null;

  const isAgentThread = activeThread?.type === "system_ai" || activeThread?.title === AGENT_RONIN_TITLE;

  const getThreadTitle = () => {
    if (!activeThread) return "";
    if (activeThread.title) return activeThread.title;
    if (activeThread.type === "private") {
      const other = activeThread.participants.find(p => p.id !== currentUserId);
      return other?.full_name || (language === "es" ? "Chat privado" : "Private chat");
    }
    return activeThread.participants.map(p => p.full_name || "?").join(", ");
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] animate-fade-in">
      {view === "threads" && (
        <ThreadList
          threads={threads}
          currentUserId={currentUserId}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewChat={() => setView("address-book")}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      )}

      {view === "chat" && activeThread && (
        <ChatView
          threadId={activeThread.id}
          threadTitle={getThreadTitle()}
          threadType={activeThread.type}
          participants={activeThread.participants}
          currentUserId={currentUserId}
          onBack={handleBack}
          isAgentThread={isAgentThread}
        />
      )}

      {view === "address-book" && (
        <AddressBook
          currentUserId={currentUserId}
          currentUserLevel={level}
          onBack={() => setView("threads")}
          onStartDM={handleStartDM}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  );
}
