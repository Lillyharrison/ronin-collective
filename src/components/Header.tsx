import { useState, useLayoutEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { RoninWordmark } from "@/components/RoninLogo";
import { Bell, Menu, ArrowLeft } from "lucide-react";
import { NotificationsPanel, useNotificationCount } from "@/components/NotificationsPanel";
import { cn } from "@/lib/utils";
import { TextSizeControl } from "@/components/TextSizeControl";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { setSidebarOpen, canGoBack, goBack, activeSection } = useNavigation();
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = useNotificationCount();
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const row = header.querySelector<HTMLElement>(".app-header-row");
    const titleContent = header.querySelector<HTMLElement>(".app-header-title > *");
    const left = row?.firstElementChild;
    const right = row?.lastElementChild;
    const measure = () => {
      document.documentElement.style.setProperty("--app-header-h", `${header.getBoundingClientRect().height}px`);
      if (!row || !titleContent || !left || !right) return;
      const bounds = row.getBoundingClientRect();
      const centre = bounds.left + bounds.width / 2;
      const halfTitle = titleContent.getBoundingClientRect().width / 2;
      // Test the true-centred position even when the title is currently in flow.
      const overlaps = centre - halfTitle < left.getBoundingClientRect().right + 4
        || centre + halfTitle > right.getBoundingClientRect().left - 4;
      const flow = String(overlaps);
      if (row.dataset.titleFlow !== flow) row.dataset.titleFlow = flow;
    };
    const observer = new ResizeObserver(measure);
    [header, row, titleContent, left, right].forEach(element => {
      if (element) observer.observe(element);
    });
    measure();
    return () => observer.disconnect();
  }, [title]);

  return (
    <>
      <header ref={headerRef} className="fixed left-0 right-0 z-50 bg-charcoal border-b border-charcoal-light" style={{ top: "calc(var(--push-banner-h, 0px) + var(--preview-banner-h, 0px))", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="app-header-row relative flex items-center justify-between px-4 h-14">
          {/* Left — hamburger always visible; back arrow shown alongside when applicable */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-cream/70 hover:text-cream hover:bg-charcoal-light transition-colors"
              aria-label={t("openMenu")}
            >
              <Menu size={22} />
            </button>
            {canGoBack && activeSection !== "dashboard" && (
              <button
                onClick={goBack}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-cream/70 hover:text-cream hover:bg-charcoal-light transition-colors"
                aria-label={t("goBack")}
              >
                <ArrowLeft size={18} />
              </button>
            )}
          </div>

          {/* Center — absolutely positioned so it's always truly centred */}
          <div className="app-header-title absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
            {title ? (
              <h1 className="font-display text-xl text-cream tracking-wide">{title}</h1>
            ) : (
              <RoninWordmark height={18} />
            )}
          </div>

          {/* Right — language toggle + bell */}
          <div className="flex items-center gap-1">
            <TextSizeControl />
            <button
              onClick={() => setLanguage(language === "en" ? "es" : "en")}
              className="min-w-11 h-11 px-2.5 rounded-md border border-gold/40 text-gold text-xs font-semibold tracking-widest hover:bg-gold/10 transition-colors"
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
              aria-label={t("notificationsLabel")}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[16px] h-4 bg-status-urgent rounded-full flex items-center justify-center text-[0.5625rem] font-bold text-white px-0.5">
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
