import { createContext, useContext, useState, useRef, ReactNode } from "react";

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
  // Care guide detail
  careGuideDetailId: string | null;
  openCareGuideDetail: (templateId: string) => void;
  closeCareGuideDetail: () => void;
  // Deep-link to a specific property (one-shot, cleared after use)
  targetPropertyId: string | null;
  setTargetPropertyId: (id: string | null) => void;
  // Persisted currently-selected property
  activePropertyId: string | null;
  setActivePropertyId: (id: string | null) => void;
  // Deep-link to checklists filtered for a specific property
  checklistsForPropertyId: string | null;
  setChecklistsForPropertyId: (id: string | null) => void;
  // Deep-link to open a specific maintenance issue drawer (one-shot, cleared after use)
  pendingMaintenanceIssueId: string | null;
  setPendingMaintenanceIssueId: (id: string | null) => void;
  // Stable ref version — survives navigation state batching
  pendingMaintenanceIssueIdRef: React.MutableRefObject<string | null>;
  // Back navigation
  canGoBack: boolean;
  goBack: () => void;
  // Whether user is inside an active chat (hides bottom nav)
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
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

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checklistDetailId, setChecklistDetailId] = useState<string | null>(null);
  const [checklistDetailPropId, setChecklistDetailPropId] = useState<string | null>(null);
  const [careGuideDetailId, setCareGuideDetailId] = useState<string | null>(null);
  const [targetPropertyId, setTargetPropertyId] = useState<string | null>(null);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [checklistsForPropertyId, setChecklistsForPropertyId] = useState<string | null>(null);
  const [pendingMaintenanceIssueId, setPendingMaintenanceIssueIdState] = useState<string | null>(null);
  // Ref mirrors the state — survives React batched render cycles
  const pendingMaintenanceIssueIdRef = useRef<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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
    setActiveSection(newSection);
    setSidebarOpen(false);
    if (tab !== "property") setActivePropertyId(null);
  };

  const handleSetActiveSection = (section: ActiveSection) => {
    if (section !== activeSection) {
      setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
      setChecklistDetailId(null);
    }
    setActiveSection(section);
    setSidebarOpen(false);
    const tabMap: Partial<Record<ActiveSection, ActiveTab>> = {
      dashboard: "home",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    if (tabMap[section]) setActiveTab(tabMap[section]!);
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
    setActiveSection(prev.section);
    if (prev.propertyId !== undefined) {
      setActivePropertyId(prev.propertyId);
      if (prev.propertyId) setTargetPropertyId(prev.propertyId);
    }
    const tabMap: Partial<Record<ActiveSection, ActiveTab>> = {
      dashboard: "home",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    if (tabMap[prev.section]) setActiveTab(tabMap[prev.section]!);
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
