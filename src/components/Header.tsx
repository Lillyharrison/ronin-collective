import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { RoninWordmark } from "@/components/RoninLogo";
import { Bell, Menu, ArrowLeft } from "lucide-react";
import { NotificationsPanel, useNotificationCount } from "@/components/NotificationsPanel";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { language, setLanguage } = useLanguage();
  const { setSidebarOpen, canGoBack, goBack, activeSection } = useNavigation();
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = useNotificationCount();

  // Show back button instead of hamburger when we can go back AND we're not on dashboard
  const showBack = canGoBack && activeSection !== "dashboard";

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-charcoal border-b border-charcoal-light">
        <div className="relative flex items-center justify-between px-4 h-14">
          {/* Left — hamburger always visible; back arrow shown alongside when applicable */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-cream/70 hover:text-cream hover:bg-charcoal-light transition-colors"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            {canGoBack && activeSection !== "dashboard" && (
              <button
                onClick={goBack}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-cream/70 hover:text-cream hover:bg-charcoal-light transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft size={18} />
              </button>
            )}
          </div>

          {/* Center — absolutely positioned so it's always truly centred */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
            {title ? (
              <h1 className="font-display text-xl text-cream tracking-wide">{title}</h1>
            ) : (
              <RoninWordmark height={18} />
            )}
          </div>

          {/* Right — language toggle + bell */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLanguage(language === "en" ? "es" : "en")}
              className="h-8 px-2.5 rounded-md border border-gold/40 text-gold text-xs font-semibold tracking-widest hover:bg-gold/10 transition-colors"
            >
              {language === "en" ? "ES" : "EN"}
            </button>
            <button
              onClick={() => setNotifOpen(v => !v)}
              className={cn(
                "w-11 h-11 flex items-center justify-center rounded-lg transition-colors relative",
                notifOpen
                  ? "text-cream bg-charcoal-light"
                  : "text-cream/70 hover:text-cream hover:bg-charcoal-light"
              )}
              aria-label="Notifications"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[16px] h-4 bg-status-urgent rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
}
