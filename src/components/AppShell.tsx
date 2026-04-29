import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@/contexts/NavigationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PreviewModeBanner } from "@/components/PreviewModeBanner";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistTemplate } from "@/hooks/useChecklists";
import { Bell, X } from "lucide-react";

// ── Lazy-loaded section components ───────────────────────────────────────────
// Only the active section's bundle is downloaded — everything else is deferred.
const Dashboard          = lazy(() => import("@/components/sections/Dashboard").then(m => ({ default: m.Dashboard })));
const PropertySection    = lazy(() => import("@/components/sections/PropertySection").then(m => ({ default: m.PropertySection })));
const MaintenanceSection = lazy(() => import("@/components/sections/MaintenanceSection").then(m => ({ default: m.MaintenanceSection })));
const MessagesSection    = lazy(() => import("@/components/sections/MessagesSection").then(m => ({ default: m.MessagesSection })));
const ProfileSection     = lazy(() => import("@/components/sections/ProfileSection").then(m => ({ default: m.ProfileSection })));
const ManualsSection     = lazy(() => import("@/components/sections/ManualsSection").then(m => ({ default: m.ManualsSection })));
const ChecklistsSection  = lazy(() => import("@/components/sections/ChecklistsSection").then(m => ({ default: m.ChecklistsSection })));
const TasksSection       = lazy(() => import("@/components/sections/TasksSection").then(m => ({ default: m.TasksSection })));
const ContactsSection    = lazy(() => import("@/components/sections/ContactsSection").then(m => ({ default: m.ContactsSection })));
const VendorsSection     = lazy(() => import("@/components/sections/VendorsSection").then(m => ({ default: m.VendorsSection })));
const InventorySection   = lazy(() => import("@/components/sections/InventorySection").then(m => ({ default: m.InventorySection })));
const LaundrySection     = lazy(() => import("@/components/sections/LaundrySection").then(m => ({ default: m.LaundrySection })));
const OrdersSection      = lazy(() => import("@/components/sections/OrdersSection").then(m => ({ default: m.OrdersSection })));
const MeetTeamSection    = lazy(() => import("@/components/sections/MeetTeamSection").then(m => ({ default: m.MeetTeamSection })));
const TravelSection      = lazy(() => import("@/components/sections/TravelSection").then(m => ({ default: m.TravelSection })));
const AchievementsSection= lazy(() => import("@/components/sections/AchievementsSection").then(m => ({ default: m.AchievementsSection })));
const CalendarSection    = lazy(() => import("@/components/sections/CalendarSection").then(m => ({ default: m.CalendarSection })));
const MasterImportSection= lazy(() => import("@/components/sections/MasterImportSection").then(m => ({ default: m.MasterImportSection })));
const MemorySection      = lazy(() => import("@/components/sections/MemorySection"));
const AlertsSection      = lazy(() => import("@/components/sections/AlertsSection").then(m => ({ default: m.AlertsSection })));
const RulesSection       = lazy(() => import("@/components/sections/RulesSection").then(m => ({ default: m.RulesSection })));
const CarWashSection     = lazy(() => import("@/components/sections/CarWashSection").then(m => ({ default: m.CarWashSection })));
const StaffSchedulingSection = lazy(() => import("@/components/sections/StaffSchedulingSection").then(m => ({ default: m.StaffSchedulingSection })));
const ChecklistDetailPage= lazy(() => import("@/components/sections/ChecklistDetailPage").then(m => ({ default: m.ChecklistDetailPage })));

// ── Section loading skeleton ──────────────────────────────────────────────────
function SectionSkeleton() {
  return (
    <div className="px-4 py-4 space-y-3 animate-pulse">
      <div className="h-7 w-40 bg-muted rounded-lg" />
      <div className="h-4 w-24 bg-muted/60 rounded-lg" />
      <div className="h-24 bg-muted/40 rounded-xl mt-4" />
      <div className="h-24 bg-muted/40 rounded-xl" />
      <div className="h-24 bg-muted/40 rounded-xl" />
    </div>
  );
}

const sectionTitles: Record<string, string> = {
  dashboard:       "",
  property:        "Properties",
  maintenance:     "Maintenance",
  messages:        "Messages",
  profile:         "Profile",
  manuals:         "Manuals",
  checklists:      "Checklists",
  tasks:           "Tasks",
  contacts:        "Contacts",
  vendors:         "Vendors",
  inventory:       "Inventory & Assets",
  laundry:         "Laundry",
  orders:          "Orders",
  "meet-team":     "Meet the Team",
  travel:          "Travel",
  calendar:        "Calendar",
  achievements:    "Achievements",
  "master-import": "Master Import",
  alerts:          "Alerts",
  rules:           "Property Rules",
  "car-wash":      "Car Wash",
  "staff-schedule":"Staff Schedule",
};

function ActiveSection() {
  const { activeSection, setActiveSection } = useNavigation();
  const { canSee, loading: permLoading, isMasterAdmin } = usePermissions();

  if (permLoading) return <SectionSkeleton />;

  const gated = (section: string, element: React.ReactElement) => {
    if (isMasterAdmin || canSee(section)) return element;
    if (activeSection === section) {
      setTimeout(() => setActiveSection("dashboard"), 0);
    }
    return null;
  };

  switch (activeSection) {
    case "dashboard":     return <Dashboard />;
    case "property":      return gated("property",      <PropertySection />);
    case "maintenance":   return gated("maintenance",   <MaintenanceSection />);
    case "messages":      return gated("messages",      <MessagesSection />);
    case "profile":       return <ProfileSection />;
    case "manuals":       return gated("manuals",       <ManualsSection />);
    case "checklists":    return gated("checklists",    <ChecklistsSection />);
    case "tasks":         return gated("tasks",         <TasksSection />);
    case "contacts":      return gated("contacts",      <ContactsSection />);
    case "vendors":       return gated("vendors",       <VendorsSection />);
    case "inventory":     return gated("inventory",     <InventorySection />);
    case "laundry":       return gated("laundry",       <LaundrySection />);
    case "orders":        return gated("orders",        <OrdersSection />);
    case "meet-team":     return gated("meet-team",     <MeetTeamSection />);
    case "travel":        return gated("travel",        <TravelSection />);
    case "calendar":      return gated("calendar",      <CalendarSection />);
    case "achievements":  return gated("achievements",  <AchievementsSection />);
    case "master-import": return gated("master-import", <MasterImportSection />);
    case "memory":        return gated("memory",        <MemorySection />);
    case "alerts":        return <AlertsSection />;
    case "rules":         return gated("rules",         <RulesSection />);
    case "car-wash":      return gated("car-wash",      <CarWashSection />);
    case "staff-schedule":return gated("staff-schedule",<StaffSchedulingSection />);
    default:              return <Dashboard />;
  }
}

// ── Push notification prompt banner ──────────────────────────────────────────
// Rendered ABOVE the fixed header. When visible, sets `--push-banner-h` on
// <html> so the header + main content shift down accordingly (no overlap on iOS).
const PUSH_BANNER_HEIGHT = 40; // px

function PushPromptBanner({ userId }: { userId: string }) {
  const { supported, permission, subscribed, requestAndSubscribe } = usePushNotifications(userId);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("push-prompt-dismissed") === "1");
  const [requesting, setRequesting] = useState(false);

  const visible = supported && permission !== "denied" && permission !== "granted" && !subscribed && !dismissed;

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--push-banner-h",
      visible ? `${PUSH_BANNER_HEIGHT}px` : "0px",
    );
    return () => { document.documentElement.style.setProperty("--push-banner-h", "0px"); };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[70] flex items-center gap-3 px-4 bg-gold/95 text-charcoal"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        height: `calc(${PUSH_BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))`,
      }}
    >
      <Bell size={16} className="shrink-0" />
      <p className="flex-1 text-xs font-medium leading-snug">
        Enable notifications to get alerts for new messages even when the app is closed.
      </p>
      <button
        onClick={async () => {
          setRequesting(true);
          await requestAndSubscribe();
          setRequesting(false);
          setDismissed(true);
          localStorage.setItem("push-prompt-dismissed", "1");
        }}
        disabled={requesting}
        className="shrink-0 text-xs font-bold underline underline-offset-2"
      >
        {requesting ? "…" : "Enable"}
      </button>
      <button onClick={() => { setDismissed(true); localStorage.setItem("push-prompt-dismissed", "1"); }}
        className="shrink-0 p-0.5">
        <X size={14} />
      </button>
    </div>
  );
}

export function AppShell() {
  const { activeSection, checklistDetailId, checklistDetailPropId, isChatOpen } = useNavigation();
  const { user } = useAuth();
  const title = activeSection === "dashboard" ? undefined : sectionTitles[activeSection];

  // React Query: dedupes & caches the checklist template across navigations.
  // Switching back to the same checklist is now instant (served from cache).
  const { data: detailTemplate } = useQuery({
    queryKey: ["checklist-template-detail", checklistDetailId],
    enabled: !!checklistDetailId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_templates").select("*").eq("id", checklistDetailId!).single();
      return (data as unknown as ChecklistTemplate) ?? null;
    },
  });

  const { data: detailPropName } = useQuery({
    queryKey: ["property-name", checklistDetailPropId],
    enabled: !!checklistDetailPropId,
    staleTime: 5 * 60_000, // property names rarely change
    queryFn: async () => {
      const { data } = await supabase
        .from("properties").select("name").eq("id", checklistDetailPropId!).single();
      return data?.name ?? undefined;
    },
  });

  const showDetail = !!checklistDetailId && !!detailTemplate;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header title={showDetail ? undefined : title} />
      {user?.id && <PushPromptBanner userId={user.id} />}
      <PreviewModeBanner />
      <OfflineBanner />

      <main
        className={activeSection === "messages" ? "h-[100dvh] overflow-hidden" : "min-h-screen pb-20"}
        style={{
          paddingTop: "calc(56px + env(safe-area-inset-top, 0px) + var(--push-banner-h, 0px) + var(--preview-banner-h, 0px))",
        }}
      >
        <Suspense fallback={<SectionSkeleton />}>
          {showDetail ? (
            <ChecklistDetailPage
              template={detailTemplate!}
              propertyId={checklistDetailPropId}
              propertyName={detailPropName}
            />
          ) : (
            <ActiveSection />
          )}
        </Suspense>
      </main>

      {!isChatOpen && <BottomNav />}
    </div>
  );
}
