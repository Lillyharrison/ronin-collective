import { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

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

// ── Path ↔ section mapping ────────────────────────────────────────────────────
const SECTION_TO_PATH: Record<ActiveSection, string> = {
  dashboard:       "/",
  property:        "/property",
  maintenance:     "/maintenance",
  messages:        "/messages",
  profile:         "/profile",
  manuals:         "/manuals",
  checklists:      "/checklists",
  tasks:           "/tasks",
  contacts:        "/contacts",
  inventory:       "/inventory",
  laundry:         "/laundry",
  orders:          "/orders",
  "meet-team":     "/meet-team",
  travel:          "/travel",
  calendar:        "/calendar",
  achievements:    "/achievements",
  "master-import": "/master-import",
  memory:          "/memory",
  alerts:          "/alerts",
  rules:           "/rules",
};

const PATH_TO_SECTION: Record<string, ActiveSection> = Object.fromEntries(
  Object.entries(SECTION_TO_PATH).map(([k, v]) => [v, k as ActiveSection])
);

function pathToSection(pathname: string): ActiveSection {
  return PATH_TO_SECTION[pathname] ?? "dashboard";
}

const TAB_MAP: Partial<Record<ActiveSection, ActiveTab>> = {
  dashboard:   "home",
  property:    "property",
  maintenance: "maintenance",
  messages:    "messages",
  profile:     "profile",
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
  totalUnread: 0,
  setTotalUnread: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function NavigationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Derive active section purely from the URL — single source of truth
  const activeSection = pathToSection(location.pathname);
  const activeTab: ActiveTab = TAB_MAP[activeSection] ?? "home";

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
  const [totalUnread, setTotalUnread] = useState(0);
  // In-memory breadcrumb stack for the back button (sections only, not browser history)
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const setPendingMaintenanceIssueId = (id: string | null) => {
    pendingMaintenanceIssueIdRef.current = id;
    setPendingMaintenanceIssueIdState(id);
  };

  const setActiveSection = useCallback((section: ActiveSection) => {
    const path = SECTION_TO_PATH[section] ?? "/";
    setHistory(prev => [...prev, { section: activeSection, propertyId: activePropertyId }].slice(-20));
    setChecklistDetailId(null);
    setSidebarOpen(false);
    if (section !== "property") setActivePropertyId(null);
    navigate(path);
  }, [navigate, activeSection, activePropertyId]);

  const setActiveTab = useCallback((tab: ActiveTab) => {
    const sectionMap: Record<ActiveTab, ActiveSection> = {
      home: "dashboard",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    setActiveSection(sectionMap[tab]);
  }, [setActiveSection]);

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
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      if (prev.propertyId !== undefined) {
        setActivePropertyId(prev.propertyId);
        if (prev.propertyId) setTargetPropertyId(prev.propertyId);
      }
      navigate(SECTION_TO_PATH[prev.section] ?? "/");
      return;
    }
    // Fall back to browser history
    navigate(-1);
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
        setActiveTab,
        activeSection,
        setActiveSection,
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
        totalUnread,
        setTotalUnread,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
