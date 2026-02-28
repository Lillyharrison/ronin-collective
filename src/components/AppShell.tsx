import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { CalendarSection } from "@/components/sections/CalendarSection";

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
  calendar:    "Calendar",
};

function ActiveSection() {
  const { activeSection } = useNavigation();
  switch (activeSection) {
    case "dashboard":   return <Dashboard />;
    case "property":    return <PropertySection />;
    case "maintenance": return <MaintenanceSection />;
    case "messages":    return <MessagesSection />;
    case "profile":     return <ProfileSection />;
    case "manuals":     return <ManualsSection />;
    case "tasks":       return <TasksSection />;
    case "contacts":    return <ContactsSection />;
    case "inventory":   return <InventorySection />;
    case "laundry":     return <LaundrySection />;
    case "orders":      return <OrdersSection />;
    case "meet-team":   return <MeetTeamSection />;
    case "travel":      return <TravelSection />;
    case "calendar":    return <CalendarSection />;
    default:            return <Dashboard />;
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
