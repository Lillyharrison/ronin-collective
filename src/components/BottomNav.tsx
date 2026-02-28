import { useNavigation, ActiveTab } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { RoninR } from "@/components/RoninLogo";
import { Home, Wrench, MessageCircle, User } from "lucide-react";

const tabs: { id: ActiveTab; labelKey: "home" | "property" | "maintenance" | "messages" | "profile"; icon: React.ReactNode; isLogo?: boolean; isChat?: boolean }[] = [
  { id: "home",        labelKey: "home",        icon: <Home size={22} /> },
  { id: "property",   labelKey: "property",    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: "messages",   labelKey: "messages",    icon: <MessageCircle size={24} />, isChat: true },
  { id: "maintenance",labelKey: "maintenance", icon: <Wrench size={22} /> },
  { id: "profile",    labelKey: "profile",     icon: <User size={22} /> },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useNavigation();
  const { t } = useLanguage();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-charcoal border-t border-charcoal-light">
      <div className="flex items-center justify-around h-16 px-2" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          if (tab.id === "home") {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab("home")}
                className="flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2"
                aria-label={t(tab.labelKey)}
              >
                <RoninR size={30} className={isActive ? "ring-2 ring-gold ring-offset-1 ring-offset-charcoal rounded-sm" : "opacity-70"} />
              </button>
            );
          }

          if (tab.isChat) {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 -mt-3"
                aria-label={t(tab.labelKey)}
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isActive
                    ? "bg-[#25D366] text-white scale-105"
                    : "bg-[#128C7E] text-white"
                }`}>
                  <MessageCircle size={26} fill="white" strokeWidth={0} />
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
              aria-label={t(tab.labelKey)}
            >
              {tab.icon}
              <span className="text-[9px] font-medium tracking-wide uppercase leading-none">
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
