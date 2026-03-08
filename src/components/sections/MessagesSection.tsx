import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePresence } from "@/hooks/usePresence";
import { useThreads } from "@/hooks/useThreads";
import { useNavigation } from "@/contexts/NavigationContext";
import { ThreadList } from "@/components/messaging/ThreadList";
import { ChatView } from "@/components/messaging/ChatView";
import { AddressBook } from "@/components/messaging/AddressBook";

type View = "threads" | "chat" | "address-book";

const AGENT_RONIN_TITLE = "Agent Ronin";

export function MessagesSection() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { level, userId, isMasterAdmin } = usePermissions();
  const { setIsChatOpen, setTotalUnread } = useNavigation();
  const [view, setView] = useState<View>("threads");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = user?.id ?? null;
  usePresence(currentUserId);

  const { threads, loading, createDM, createGroup, deleteThread } = useThreads(currentUserId);

  // Sync isChatOpen with navigation context so AppShell can hide/show BottomNav
  useEffect(() => {
    setIsChatOpen(view === "chat");
    return () => setIsChatOpen(false);
  }, [view, setIsChatOpen]);

  // Sync total unread into NavigationContext so BottomNav badge stays accurate
  // without needing its own realtime subscription
  useEffect(() => {
    const total = threads.reduce((sum, t) => sum + t.unread_count, 0);
    setTotalUnread(total);
  }, [threads, setTotalUnread]);

  // Auto-create the dedicated #Maintenance thread if it doesn't exist yet
  useEffect(() => {
    if (!currentUserId) return;
    const existing = threads.find(t => t.title === "Maintenance Reports");
    if (existing) return;
    if (threads.length === 0) return; // wait for threads to load
    // Create it once (all admins + managers get added via participant_ids null = system thread)
    supabase.from("chat_threads").insert({
      type: "group" as const,
      title: "Maintenance Reports",
      participant_ids: [currentUserId],
      created_by: currentUserId,
    }).then(({ error }) => {
      if (!error) {
        // Intentionally don't navigate — just ensure it exists
      }
    });
  }, [currentUserId, threads]);


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
    if (!currentUserId) return;
    // Filter out agent-ronin sentinel — it has no real user ID
    const realParticipants = participantIds.filter(id => id !== "agent-ronin");
    const includesRonin = participantIds.includes("agent-ronin");

    const threadId = await createGroup(name, realParticipants);
    if (threadId && includesRonin) {
      // Mark thread as containing the AI agent so ChatView knows to route to edge fn
      await supabase
        .from("chat_threads")
        .update({ type: "system_ai" } as never)
        .eq("id", threadId);
    }
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
    <div className={view === "chat" ? "h-[calc(100dvh-3.5rem)] flex flex-col" : "animate-fade-in"}>
      {view === "threads" && (
        <ThreadList
          threads={threads}
          currentUserId={currentUserId}
          isAdmin={isMasterAdmin}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewChat={() => setView("address-book")}
          onDeleteThread={isMasterAdmin ? deleteThread : undefined}
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
          isAdmin={isMasterAdmin}
          onBack={handleBack}
          isAgentThread={isAgentThread}
        />
      )}

      {view === "address-book" && (
        <AddressBook
          currentUserId={currentUserId}
          currentUserLevel={level}
          isMasterAdmin={isMasterAdmin}
          onBack={() => setView("threads")}
          onStartDM={handleStartDM}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  );
}
