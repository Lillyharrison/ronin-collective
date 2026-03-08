import { createContext, useContext, useState, useRef, useEffect, ReactNode } from "react";

export type ActiveTab = "home" | "property" | "maintenance" | "messages" | "profile";
export type ActiveSection =
  | "dashboard"
  | "property"
  | "maintenance"
  | "messages"
  | "profile"
  | "manuals"
  | "checklists"
  | "tasks"
  | "contacts"
  | "inventory"
  | "laundry"
  | "orders"
  | "meet-team"
  | "travel"
  | "calendar"
  | "achievements"
  | "master-import"
  | "memory"
  | "alerts"
  | "rules";

// ── URL hash helpers ──────────────────────────────────────────────────────────
const SECTION_TO_HASH: Record<ActiveSection, string> = {
  dashboard:       "home",
  property:        "property",
  maintenance:     "maintenance",
  messages:        "messages",
  profile:         "profile",
  manuals:         "manuals",
  checklists:      "checklists",
  tasks:           "tasks",
  contacts:        "contacts",
  inventory:       "inventory",
  laundry:         "laundry",
  orders:          "orders",
  "meet-team":     "meet-team",
  travel:          "travel",
  calendar:        "calendar",
  achievements:    "achievements",
  "master-import": "master-import",
  memory:          "memory",
  alerts:          "alerts",
  rules:           "rules",
};

const HASH_TO_SECTION: Record<string, ActiveSection> = Object.fromEntries(
  Object.entries(SECTION_TO_HASH).map(([k, v]) => [v, k as ActiveSection])
);

function hashToSection(hash: string): ActiveSection | null {
  return HASH_TO_SECTION[hash.replace(/^#/, "")] ?? null;
}

function sectionToHash(section: ActiveSection): string {
  return "#" + (SECTION_TO_HASH[section] ?? "home");
}

const TAB_MAP: Partial<Record<ActiveSection, ActiveTab>> = {
  dashboard: "home",
  property: "property",
  maintenance: "maintenance",
  messages: "messages",
  profile: "profile",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface HistoryEntry {
  section: ActiveSection;
  propertyId: string | null;
}

interface NavigationContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeSection: ActiveSection;
  setActiveSection: (section: ActiveSection) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  checklistDetailId: string | null;
  checklistDetailPropId: string | null;
  openChecklistDetail: (templateId: string, propertyId: string | null) => void;
  closeChecklistDetail: () => void;
  careGuideDetailId: string | null;
  openCareGuideDetail: (templateId: string) => void;
  closeCareGuideDetail: () => void;
  targetPropertyId: string | null;
  setTargetPropertyId: (id: string | null) => void;
  activePropertyId: string | null;
  setActivePropertyId: (id: string | null) => void;
  checklistsForPropertyId: string | null;
  setChecklistsForPropertyId: (id: string | null) => void;
  pendingMaintenanceIssueId: string | null;
  setPendingMaintenanceIssueId: (id: string | null) => void;
  pendingMaintenanceIssueIdRef: React.MutableRefObject<string | null>;
  canGoBack: boolean;
  goBack: () => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  /** Total unread message count — set by MessagesSection from useThreads data */
  totalUnread: number;
  setTotalUnread: (count: number) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  activeTab: "home",
  setActiveTab: () => {},
  activeSection: "dashboard",
  setActiveSection: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
  checklistDetailId: null,
  checklistDetailPropId: null,
  openChecklistDetail: () => {},
  closeChecklistDetail: () => {},
  targetPropertyId: null,
  setTargetPropertyId: () => {},
  activePropertyId: null,
  setActivePropertyId: () => {},
  checklistsForPropertyId: null,
  setChecklistsForPropertyId: () => {},
  careGuideDetailId: null,
  openCareGuideDetail: () => {},
  closeCareGuideDetail: () => {},
  pendingMaintenanceIssueId: null,
  setPendingMaintenanceIssueId: () => {},
  pendingMaintenanceIssueIdRef: { current: null },
  canGoBack: false,
  goBack: () => {},
  isChatOpen: false,
  setIsChatOpen: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function NavigationProvider({ children }: { children: ReactNode }) {
  // Initialise from URL hash so a refresh restores the correct section
  const getInitialSection = (): ActiveSection => {
    if (typeof window !== "undefined") {
      const fromHash = hashToSection(window.location.hash);
      if (fromHash) return fromHash;
    }
    return "dashboard";
  };

  const getInitialTab = (section: ActiveSection): ActiveTab =>
    TAB_MAP[section] ?? "home";

  const [activeSection, setActiveSectionState] = useState<ActiveSection>(getInitialSection);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialTab(getInitialSection()));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checklistDetailId, setChecklistDetailId] = useState<string | null>(null);
  const [checklistDetailPropId, setChecklistDetailPropId] = useState<string | null>(null);
  const [careGuideDetailId, setCareGuideDetailId] = useState<string | null>(null);
  const [targetPropertyId, setTargetPropertyId] = useState<string | null>(null);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [checklistsForPropertyId, setChecklistsForPropertyId] = useState<string | null>(null);
  const [pendingMaintenanceIssueId, setPendingMaintenanceIssueIdState] = useState<string | null>(null);
  const pendingMaintenanceIssueIdRef = useRef<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Keep URL hash in sync whenever the section changes
  useEffect(() => {
    const hash = sectionToHash(activeSection);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activeSection]);

  // Handle browser back / forward buttons
  useEffect(() => {
    const onHashChange = () => {
      const section = hashToSection(window.location.hash);
      if (section) {
        setActiveSectionState(section);
        if (TAB_MAP[section]) setActiveTab(TAB_MAP[section]!);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setPendingMaintenanceIssueId = (id: string | null) => {
    pendingMaintenanceIssueIdRef.current = id;
    setPendingMaintenanceIssueIdState(id);
  };

  const handleSetActiveTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    const sectionMap: Record<ActiveTab, ActiveSection> = {
      home: "dashboard",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    const newSection = sectionMap[tab];
    setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
    setActiveSectionState(newSection);
    setSidebarOpen(false);
    if (tab !== "property") setActivePropertyId(null);
  };

  const handleSetActiveSection = (section: ActiveSection) => {
    if (section !== activeSection) {
      setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
      setChecklistDetailId(null);
    }
    setActiveSectionState(section);
    setSidebarOpen(false);
    if (TAB_MAP[section]) setActiveTab(TAB_MAP[section]!);
  };

  const openCareGuideDetail = (templateId: string) => {
    setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
    setCareGuideDetailId(templateId);
  };

  const closeCareGuideDetail = () => {
    setCareGuideDetailId(null);
    setHistory(h => h.slice(0, -1));
  };

  const goBack = () => {
    if (careGuideDetailId) { setCareGuideDetailId(null); return; }
    if (checklistDetailId) { setChecklistDetailId(null); setChecklistDetailPropId(null); return; }
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setActiveSectionState(prev.section);
    if (prev.propertyId !== undefined) {
      setActivePropertyId(prev.propertyId);
      if (prev.propertyId) setTargetPropertyId(prev.propertyId);
    }
    if (TAB_MAP[prev.section]) setActiveTab(TAB_MAP[prev.section]!);
  };

  const openChecklistDetail = (templateId: string, propertyId: string | null) => {
    setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
    setChecklistDetailId(templateId);
    setChecklistDetailPropId(propertyId);
  };

  const closeChecklistDetail = () => { goBack(); };

  const canGoBack = history.length > 0 || !!checklistDetailId || !!careGuideDetailId;

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab: handleSetActiveTab,
        activeSection,
        setActiveSection: handleSetActiveSection,
        sidebarOpen,
        setSidebarOpen,
        checklistDetailId,
        checklistDetailPropId,
        openChecklistDetail,
        closeChecklistDetail,
        careGuideDetailId,
        openCareGuideDetail,
        closeCareGuideDetail,
        targetPropertyId,
        setTargetPropertyId,
        activePropertyId,
        setActivePropertyId,
        checklistsForPropertyId,
        setChecklistsForPropertyId,
        pendingMaintenanceIssueId,
        setPendingMaintenanceIssueId,
        pendingMaintenanceIssueIdRef,
        canGoBack,
        goBack,
        isChatOpen,
        setIsChatOpen,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
