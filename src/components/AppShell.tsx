import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/sections/Dashboard";
import { PropertySection } from "@/components/sections/PropertySection";
import { MaintenanceSection } from "@/components/sections/MaintenanceSection";
import { MessagesSection } from "@/components/sections/MessagesSection";
import { ProfileSection } from "@/components/sections/ProfileSection";
import { ManualsSection } from "@/components/sections/ManualsSection";
import { ChecklistsSection } from "@/components/sections/ChecklistsSection";
import { TasksSection } from "@/components/sections/TasksSection";
import { ContactsSection } from "@/components/sections/ContactsSection";
import { InventorySection } from "@/components/sections/InventorySection";
import { LaundrySection } from "@/components/sections/LaundrySection";
import { OrdersSection } from "@/components/sections/OrdersSection";
import { MeetTeamSection } from "@/components/sections/MeetTeamSection";
import { TravelSection } from "@/components/sections/TravelSection";
import { AchievementsSection } from "@/components/sections/AchievementsSection";
import { CalendarSection } from "@/components/sections/CalendarSection";
import { MasterImportSection } from "@/components/sections/MasterImportSection";
import MemorySection from "@/components/sections/MemorySection";
import { AlertsSection } from "@/components/sections/AlertsSection";
import { RulesSection } from "@/components/sections/RulesSection";

import { ChecklistDetailPage } from "@/components/sections/ChecklistDetailPage";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistTemplate } from "@/hooks/useChecklists";

const sectionTitles: Record<string, string> = {
  dashboard:    "",
  property:     "Properties",
  maintenance:  "Maintenance",
  messages:     "Messages",
  profile:      "Profile",
  manuals:      "Manuals",
  checklists:   "Checklists",
  tasks:        "Tasks",
  contacts:     "Contacts & Vendors",
  inventory:    "Inventory & Assets",
  laundry:      "Laundry",
  orders:       "Orders",
  "meet-team":  "Meet the Team",
  travel:       "Travel",
  calendar:     "Calendar",
  achievements: "Achievements",
  "master-import": "Master Import",
  alerts:       "Alerts",
  rules:        "Property Rules",
};

function ActiveSection() {
  const { activeSection, setActiveSection } = useNavigation();
  const { canSee, loading: permLoading, isMasterAdmin } = usePermissions();

  if (permLoading) return null;

  const gated = (section: string, element: React.ReactElement) => {
    if (isMasterAdmin || canSee(section)) return element;
    if (activeSection === section) {
      setTimeout(() => setActiveSection("dashboard"), 0);
    }
    return null;
  };

  switch (activeSection) {
    case "dashboard":    return <Dashboard />;
    case "property":     return gated("property",     <PropertySection />);
    case "maintenance":  return gated("maintenance",  <MaintenanceSection />);
    case "messages":     return gated("messages",     <MessagesSection />);
    case "profile":      return <ProfileSection />;
    case "manuals":      return gated("manuals",      <ManualsSection />);
    case "checklists":   return gated("checklists",   <ChecklistsSection />);
    case "tasks":        return gated("tasks",        <TasksSection />);
    case "contacts":     return gated("contacts",     <ContactsSection />);
    case "inventory":    return gated("inventory",    <InventorySection />);
    case "laundry":      return gated("laundry",      <LaundrySection />);
    case "orders":       return gated("orders",       <OrdersSection />);
    case "meet-team":    return gated("meet-team",    <MeetTeamSection />);
    case "travel":       return gated("travel",       <TravelSection />);
    case "calendar":     return gated("calendar",     <CalendarSection />);
    case "achievements": return gated("achievements", <AchievementsSection />);
    case "master-import":return gated("master-import",<MasterImportSection />);
    case "memory":       return gated("memory",       <MemorySection />);
    case "alerts":       return <AlertsSection />;
    case "rules":        return gated("rules",        <RulesSection />);
    default:             return <Dashboard />;
  }
}

export function AppShell() {
  const { activeSection, checklistDetailId, checklistDetailPropId, isChatOpen } = useNavigation();
  const { user } = useAuth();
  const title = activeSection === "dashboard" ? undefined : sectionTitles[activeSection];
  // Auto-register push subscription when user is logged in
  usePushNotifications(user?.id ?? null);

  // Load template for checklist detail
  const [detailTemplate, setDetailTemplate] = useState<ChecklistTemplate | null>(null);
  const [detailPropName, setDetailPropName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!checklistDetailId) { setDetailTemplate(null); return; }
    supabase.from("checklist_templates").select("*").eq("id", checklistDetailId).single()
      .then(({ data }) => setDetailTemplate(data as unknown as ChecklistTemplate ?? null));
  }, [checklistDetailId]);

  useEffect(() => {
    if (!checklistDetailPropId) { setDetailPropName(undefined); return; }
    supabase.from("properties").select("name").eq("id", checklistDetailPropId).single()
      .then(({ data }) => setDetailPropName(data?.name ?? undefined));
  }, [checklistDetailPropId]);

  const showDetail = !!checklistDetailId && !!detailTemplate;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header title={showDetail ? undefined : title} />

      <main className={`pt-14 min-h-screen ${activeSection === "messages" ? "pb-0" : "pb-20"}`}>
        {showDetail ? (
          <ChecklistDetailPage
            template={detailTemplate!}
            propertyId={checklistDetailPropId}
            propertyName={detailPropName}
          />
        ) : (
          <ActiveSection />
        )}
      </main>

      {!isChatOpen && <BottomNav />}
    </div>
  );
}
