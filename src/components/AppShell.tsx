import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/components/sections/Dashboard";
import { PropertySection } from "@/components/sections/PropertySection";
import { MaintenanceSection } from "@/components/sections/MaintenanceSection";
import { MessagesSection } from "@/components/sections/MessagesSection";
import { ProfileSection } from "@/components/sections/ProfileSection";
import { ManualsSection } from "@/components/sections/ManualsSection";
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

const sectionTitles: Record<string, string> = {
  dashboard:   "",              // uses logo
  property:    "Properties",
  maintenance: "Maintenance",
  messages:    "Messages",
  profile:     "Profile",
  manuals:     "Manuals & SOPs",
  tasks:       "Tasks",
  contacts:    "Contacts & Vendors",
  inventory:   "Inventory & Assets",
  laundry:     "Laundry",
  orders:      "Orders",
  "meet-team": "Meet the Team",
  travel:      "Travel",
  calendar:       "Calendar",
  achievements:   "Achievements",
  "master-import":"Master Import",
  memory:          "Ronin's Memory",
};

function ActiveSection() {
  const { activeSection, setActiveSection } = useNavigation();
  const { canSee, loading: permLoading, isMasterAdmin } = usePermissions();

  // While permissions load, render nothing to avoid flashing forbidden content
  if (permLoading) return null;

  // Permission gate: if the user lacks access, redirect them to dashboard silently
  const gated = (section: string, element: React.ReactElement) => {
    if (isMasterAdmin || canSee(section)) return element;
    // Redirect to dashboard if they somehow navigate to a forbidden section
    if (activeSection === section) {
      setTimeout(() => setActiveSection("dashboard"), 0);
    }
    return null;
  };

  switch (activeSection) {
    case "dashboard":   return <Dashboard />;
    case "property":    return gated("property",    <PropertySection />);
    case "maintenance": return gated("maintenance", <MaintenanceSection />);
    case "messages":    return gated("messages",    <MessagesSection />);
    case "profile":     return <ProfileSection />;
    case "manuals":     return gated("manuals",     <ManualsSection />);
    case "tasks":       return gated("tasks",       <TasksSection />);
    case "contacts":    return gated("contacts",    <ContactsSection />);
    case "inventory":   return gated("inventory",   <InventorySection />);
    case "laundry":     return gated("laundry",     <LaundrySection />);
    case "orders":      return gated("orders",      <OrdersSection />);
    case "meet-team":   return gated("meet-team",   <MeetTeamSection />);
    case "travel":      return gated("travel",      <TravelSection />);
    case "calendar":    return gated("calendar",    <CalendarSection />);
    case "achievements":  return gated("achievements",  <AchievementsSection />);
    case "master-import": return gated("master-import", <MasterImportSection />);
    case "memory":        return gated("memory",        <MemorySection />);
    default:              return <Dashboard />;
  }
}

export function AppShell() {
  const { activeSection } = useNavigation();
  const { language } = useLanguage();
  const title = activeSection === "dashboard" ? undefined : sectionTitles[activeSection];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header title={title} />

      {/* Main scrollable content */}
      <main className="pt-14 pb-20 min-h-screen">
        <ActiveSection />
      </main>

      <BottomNav />
    </div>
  );
}
