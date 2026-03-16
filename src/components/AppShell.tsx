import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigation } from "@/contexts/NavigationContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { OfflineBanner } from "@/components/OfflineBanner";
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
    default:              return <Dashboard />;
  }
}

// ── Push notification prompt banner ──────────────────────────────────────────
function PushPromptBanner({ userId }: { userId: string }) {
  const { supported, permission, subscribed, requestAndSubscribe } = usePushNotifications(userId);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("push-prompt-dismissed") === "1");
  const [requesting, setRequesting] = useState(false);

  // Show only if: supported, not yet granted/denied, not subscribed, not dismissed
  if (!supported || permission === "denied" || subscribed || dismissed) return null;
  // Don't re-prompt if they already granted permission (auto-subscribe handles it)
  if (permission === "granted") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-3 px-4 py-2.5 bg-gold/95 text-charcoal"
      style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))" }}>
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
      {user?.id && <PushPromptBanner userId={user.id} />}
      <OfflineBanner />

      <main
        className={activeSection === "messages" ? "h-[100dvh] overflow-hidden" : "min-h-screen pb-20"}
        style={{
          paddingTop: activeSection === "messages"
            ? "calc(56px + env(safe-area-inset-top, 0px))"
            : "calc(56px + env(safe-area-inset-top, 0px))",
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
