import { useNavigation, ActiveTab } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { RoninR } from "@/components/RoninLogo";
import { Home, Wrench, MessageCircle, User } from "lucide-react";

const PROPERTY_ICON = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;

const ALL_TABS: { id: ActiveTab; label: string; icon: React.ReactNode; section?: string; isChat?: boolean }[] = [
  { id: "home",        label: "Home",        icon: <Home size={22} /> },
  { id: "property",   label: "Properties",  icon: PROPERTY_ICON,              section: "property" },
  { id: "messages",   label: "Messages",    icon: <MessageCircle size={24} />, isChat: true,        section: "messages" },
  { id: "maintenance",label: "Maintenance", icon: <Wrench size={22} />,        section: "maintenance" },
  { id: "profile",    label: "Profile",     icon: <User size={22} /> },
];

export function BottomNav() {
  const { activeTab, setActiveTab, totalUnread } = useNavigation();
  const { canSee, isMasterAdmin, loading: permLoading } = usePermissions();
  const { user } = useAuth();
  // Seed the initial cold count before MessagesSection hydrates totalUnread
  const coldCount = useUnreadCount(user?.id ?? null);
  // Prefer live count from context; fall back to cold count on first load
  const unreadCount = totalUnread > 0 ? totalUnread : coldCount;

  // Show home, messages, profile always; gate property & maintenance
  const tabs = ALL_TABS.filter(tab => {
    if (!tab.section) return true; // home & profile always visible
    if (permLoading || isMasterAdmin) return true;
    return canSee(tab.section);
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-charcoal border-t border-charcoal-light"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          if (tab.id === "home") {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab("home")}
                className="flex flex-col items-center justify-center gap-0.5 w-11 h-full px-2"
                aria-label="Home"
              >
                <RoninR size={26} className={isActive ? "ring-2 ring-gold ring-offset-1 ring-offset-charcoal rounded-sm" : "opacity-70"} />
              </button>
            );
          }

          if (tab.isChat) {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center justify-center gap-0.5 w-11 h-full px-2"
                aria-label={tab.label}
              >
                <div className={`relative w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isActive ? "bg-[#25D366] text-white scale-105" : "bg-[#128C7E] text-white"
                }`}>
                  <MessageCircle size={22} fill="white" strokeWidth={0} />
                  {/* Unread badge */}
                  {unreadCount > 0 && !isActive && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1 shadow-md border-2 border-charcoal animate-bounce">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 transition-colors ${
                isActive ? "text-gold" : "text-cream/50"
              }`}
              aria-label={tab.label}
            >
              {tab.icon}
              <span className="text-[9px] font-medium tracking-wide uppercase leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
