import { useNavigation, ActiveSection } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { RoninWordmark } from "@/components/RoninLogo";
import {
  X, Home, Wrench, MessageCircle, User,
  BookOpen, CheckSquare, Users, Package,
  Shirt, ShoppingCart, UsersRound, Plane,
  Building2, Trophy, FileSpreadsheet, Calendar,
} from "lucide-react";


interface SidebarItem {
  section: ActiveSection;
  labelKey: "home" | "property" | "maintenance" | "messages" | "profile" | "manuals" | "tasks" | "contacts" | "inventory" | "laundry" | "orders" | "meetTeam" | "travel" | "achievements" | "masterImport" | "calendar";
  icon: React.ReactNode;
  dividerBefore?: boolean;
}

const ALL_ITEMS: SidebarItem[] = [
  { section: "dashboard",    labelKey: "home",         icon: <Home size={20} /> },
  { section: "property",     labelKey: "property",     icon: <Building2 size={20} /> },
  { section: "maintenance",  labelKey: "maintenance",  icon: <Wrench size={20} /> },
  { section: "messages",     labelKey: "messages",     icon: <MessageCircle size={20} /> },
  { section: "profile",      labelKey: "profile",      icon: <User size={20} /> },
  { section: "achievements", labelKey: "achievements", icon: <Trophy size={20} />, dividerBefore: true },
  { section: "manuals",      labelKey: "manuals",      icon: <BookOpen size={20} /> },
  { section: "tasks",        labelKey: "tasks",        icon: <CheckSquare size={20} /> },
  { section: "contacts",     labelKey: "contacts",     icon: <Users size={20} /> },
  { section: "inventory",    labelKey: "inventory",    icon: <Package size={20} /> },
  { section: "laundry",      labelKey: "laundry",      icon: <Shirt size={20} />, dividerBefore: true },
  { section: "orders",       labelKey: "orders",       icon: <ShoppingCart size={20} /> },
  { section: "meet-team",    labelKey: "meetTeam",     icon: <UsersRound size={20} /> },
  { section: "travel",       labelKey: "travel",       icon: <Plane size={20} /> },
  { section: "calendar",     labelKey: "calendar",     icon: <Calendar size={20} /> },
  { section: "master-import",labelKey: "masterImport", icon: <FileSpreadsheet size={20} />, dividerBefore: true },
];

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, activeSection, setActiveSection } = useNavigation();
  const { t } = useLanguage();
  const { canSee, loading: permLoading } = usePermissions();

  if (!sidebarOpen) return null;

  const items = permLoading ? ALL_ITEMS : ALL_ITEMS.filter(item => canSee(item.section));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => setSidebarOpen(false)}
      />

      {/* Drawer */}
      <aside className="fixed top-0 left-0 bottom-0 z-50 w-72 bg-charcoal flex flex-col animate-slide-in-left shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-charcoal-light">
          <RoninWordmark height={16} />
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream hover:bg-charcoal-light transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-5 py-3 border-b border-charcoal-light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center">
              <span className="text-gold text-sm font-semibold">L</span>
            </div>
            <div>
              <p className="text-cream text-sm font-medium leading-none">Lilly</p>
              <p className="text-gold text-[10px] tracking-widest uppercase mt-0.5">Master Admin</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item) => (
            <div key={item.section}>
              {item.dividerBefore && (
                <div className="mx-5 my-2 border-t border-charcoal-light" />
              )}
              <button
                onClick={() => setActiveSection(item.section)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                  activeSection === item.section
                    ? "text-gold bg-gold/10 gold-line"
                    : "text-cream/70 hover:text-cream hover:bg-charcoal-light"
                }`}
              >
                <span className={activeSection === item.section ? "text-gold" : "text-cream/50"}>
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{t(item.labelKey)}</span>
              </button>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-charcoal-light">
          <p className="text-cream/30 text-[10px] tracking-widest uppercase">
            Ronin Collective © 2025
          </p>
        </div>
      </aside>
    </>
  );
}
