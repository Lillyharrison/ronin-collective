import { createContext, useContext, useState, ReactNode } from "react";

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
  | "memory";

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
  // Deep-link to a specific property
  targetPropertyId: string | null;
  setTargetPropertyId: (id: string | null) => void;
  // Deep-link to checklists filtered for a specific property
  checklistsForPropertyId: string | null;
  setChecklistsForPropertyId: (id: string | null) => void;
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
  checklistsForPropertyId: null,
  setChecklistsForPropertyId: () => {},
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checklistDetailId, setChecklistDetailId] = useState<string | null>(null);
  const [checklistDetailPropId, setChecklistDetailPropId] = useState<string | null>(null);
  const [targetPropertyId, setTargetPropertyId] = useState<string | null>(null);
  const [checklistsForPropertyId, setChecklistsForPropertyId] = useState<string | null>(null);

  const handleSetActiveTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    const sectionMap: Record<ActiveTab, ActiveSection> = {
      home: "dashboard",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    setActiveSection(sectionMap[tab]);
    setSidebarOpen(false);
  };

  const handleSetActiveSection = (section: ActiveSection) => {
    setActiveSection(section);
    setSidebarOpen(false);
    // Close checklist detail when navigating away
    setChecklistDetailId(null);
    const tabMap: Partial<Record<ActiveSection, ActiveTab>> = {
      dashboard: "home",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    if (tabMap[section]) setActiveTab(tabMap[section]!);
  };

  const openChecklistDetail = (templateId: string, propertyId: string | null) => {
    setChecklistDetailId(templateId);
    setChecklistDetailPropId(propertyId);
  };

  const closeChecklistDetail = () => {
    setChecklistDetailId(null);
    setChecklistDetailPropId(null);
  };

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
        targetPropertyId,
        setTargetPropertyId,
        checklistsForPropertyId,
        setChecklistsForPropertyId,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
