import { createContext, useContext, useState, ReactNode } from "react";

export type ActiveTab = "home" | "property" | "maintenance" | "messages" | "profile";
export type ActiveSection =
  | "dashboard"
  | "property"
  | "maintenance"
  | "messages"
  | "profile"
  | "manuals"
  | "tasks"
  | "contacts"
  | "inventory"
  | "laundry"
  | "orders"
  | "meet-team"
  | "travel"
  | "calendar"
  | "achievements";

interface NavigationContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeSection: ActiveSection;
  setActiveSection: (section: ActiveSection) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  activeTab: "home",
  setActiveTab: () => {},
  activeSection: "dashboard",
  setActiveSection: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    const tabMap: Partial<Record<ActiveSection, ActiveTab>> = {
      dashboard: "home",
      property: "property",
      maintenance: "maintenance",
      messages: "messages",
      profile: "profile",
    };
    if (tabMap[section]) setActiveTab(tabMap[section]!);
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
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
