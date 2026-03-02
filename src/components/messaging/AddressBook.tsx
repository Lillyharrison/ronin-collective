import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft, Search, Bot, Users, MessageCircle } from "lucide-react";

const AGENT_RONIN_ID = "agent-ronin";

interface Contact {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  level: string | null;
  job_title: string | null;
  department: string | null;
}

interface AddressBookProps {
  currentUserId: string;
  currentUserLevel: string | null;
  isMasterAdmin?: boolean;
  onBack: () => void;
  onStartDM: (userId: string) => void;
  onCreateGroup: (name: string, participantIds: string[]) => void;
}

export function AddressBook({ currentUserId, currentUserLevel, isMasterAdmin = false, onBack, onStartDM, onCreateGroup }: AddressBookProps) {
  const { language } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "group">("list");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [existingThreads, setExistingThreads] = useState<{ participant_ids: string[] }[]>([]);

  useEffect(() => {
    async function load() {
      const [profilesRes, threadsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, level, job_title, department")
          .neq("id", currentUserId)
          .order("full_name"),
        supabase
          .from("chat_threads")
          .select("participant_ids")
          .eq("type", "private")
          .contains("participant_ids", [currentUserId]),
      ]);
      setContacts(profilesRes.data ?? []);
      setExistingThreads(threadsRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [currentUserId]);

  const isStaff = currentUserLevel === "staff";

  const canMessageContact = (contact: Contact): boolean => {
    if (isMasterAdmin) return true;
    if (!isStaff) return true;
    const isFamily = contact.level === "principal" || contact.level === "extended_family";
    if (!isFamily) return true;
    return existingThreads.some(t =>
      t.participant_ids?.includes(contact.id) && t.participant_ids?.includes(currentUserId)
    );
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    return (c.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
           (c.job_title || "").toLowerCase().includes(search.toLowerCase());
  });

  // Show Agent Ronin in group mode search results too
  const showAgentRoninInList = mode === "list" && !search;
  const showAgentRoninInGroup = mode === "group" && (!search || "agent ronin".includes(search.toLowerCase()) || "ronin".includes(search.toLowerCase()));
  const agentRoninSelectedInGroup = selectedForGroup.includes(AGENT_RONIN_ID);

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedForGroup.length > 0) {
      onCreateGroup(groupName.trim(), selectedForGroup);
    }
  };

  const toggleGroupSelect = (id: string) => {
    setSelectedForGroup(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getInitials = (name: string | null) =>
    (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h2 className="font-display text-xl text-foreground">
          {mode === "group"
            ? (language === "es" ? "Nuevo Grupo" : "New Group")
            : (language === "es" ? "Contactos" : "Contacts")}
        </h2>
      </div>

      {/* Mode toggle */}
      <div className="px-4 py-2 border-b border-border flex gap-2">
        <button
          onClick={() => { setMode("list"); setSelectedForGroup([]); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === "list" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          <MessageCircle size={14} className="inline mr-1" />
          {language === "es" ? "Mensaje Directo" : "Direct Message"}
        </button>
        <button
          onClick={() => { setMode("group"); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === "group" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          <Users size={14} className="inline mr-1" />
          {language === "es" ? "Crear Grupo" : "Create Group"}
        </button>
      </div>

      {/* Group name input */}
      {mode === "group" && (
        <div className="px-4 py-2 border-b border-border">
          <input
            className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={language === "es" ? "Nombre del grupo..." : "Group name..."}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          {selectedForGroup.length > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {selectedForGroup.length} {language === "es" ? "seleccionados" : "selected"}
                {agentRoninSelectedInGroup && (
                  <span className="ml-1 text-accent">· Agent Ronin included</span>
                )}
              </span>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim()}
                className="text-xs font-semibold text-accent disabled:opacity-50"
              >
                {language === "es" ? "Crear" : "Create"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search size={16} className="text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={language === "es" ? "Buscar contactos..." : "Search contacts..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Agent Ronin entry */}
      {(showAgentRoninInList || showAgentRoninInGroup) && (
        <button
          onClick={() => {
            if (mode === "group") {
              toggleGroupSelect(AGENT_RONIN_ID);
            } else {
              onStartDM(AGENT_RONIN_ID);
            }
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 ${
            mode === "group" && agentRoninSelectedInGroup ? "bg-accent/10" : "hover:bg-muted/50"
          }`}
        >
          {mode === "group" && (
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              agentRoninSelectedInGroup ? "bg-accent border-accent" : "border-border"
            }`}>
              {agentRoninSelectedInGroup && <div className="w-2 h-2 rounded-full bg-accent-foreground" />}
            </div>
          )}
          <div className="w-11 h-11 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center flex-shrink-0">
            <Bot size={20} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Agent Ronin</p>
            <p className="text-[11px] text-accent">
              {language === "es" ? "Agente IA · Siempre en línea" : "AI Agent · Always online"}
            </p>
          </div>
        </button>
      )}

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          filtered.map((contact) => {
            const canMessage = canMessageContact(contact);
            const isSelected = selectedForGroup.includes(contact.id);

            return (
              <button
                key={contact.id}
                onClick={() => {
                  if (mode === "group") {
                    toggleGroupSelect(contact.id);
                  } else if (canMessage) {
                    onStartDM(contact.id);
                  }
                }}
                disabled={mode === "list" && !canMessage}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/30 ${
                  !canMessage && mode === "list"
                    ? "opacity-40 cursor-not-allowed"
                    : isSelected
                    ? "bg-accent/10"
                    : "hover:bg-muted/50"
                }`}
              >
                {mode === "group" && (
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? "bg-accent border-accent" : "border-border"
                  }`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-accent-foreground" />}
                  </div>
                )}

                {contact.avatar_url ? (
                  <img src={contact.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground">{getInitials(contact.full_name)}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{contact.full_name || "Unknown"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {contact.job_title || contact.department || contact.level || ""}
                  </p>
                </div>

                {!canMessage && mode === "list" && (
                  <span className="text-[9px] text-muted-foreground italic">
                    {language === "es" ? "Solo familia puede iniciar" : "Family must initiate"}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
