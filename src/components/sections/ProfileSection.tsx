import { PlaceholderSection } from "@/components/PlaceholderSection";
import { useNavigation } from "@/contexts/NavigationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { User, Trophy, Star, Flame } from "lucide-react";

// Mock earned badges for demo
const DEMO_BADGES = [
  { icon: "🎯", label: "First Task" },
  { icon: "🔥", label: "3-Day Streak" },
  { icon: "⚡", label: "Week Warrior" },
  { icon: "✅", label: "10 Tasks" },
  { icon: "📸", label: "Photo Pro" },
  { icon: "⭐", label: "Perfect Day" },
];

export function ProfileSection() {
  const { setActiveSection } = useNavigation();
  const { language } = useLanguage();

  return (
    <div className="animate-fade-in pb-4">
      {/* Profile hero */}
      <div className="bg-charcoal px-5 pt-6 pb-6 border-b border-charcoal-light flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-gold/20 border-2 border-gold/60 flex items-center justify-center mb-3">
          <span className="font-display text-gold text-3xl">L</span>
        </div>
        <h1 className="font-display text-2xl text-cream">Lilly</h1>
        <span className="mt-1 px-3 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-[10px] tracking-widest uppercase font-semibold">
          Master Admin
        </span>

        {/* Mini stats */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-gold">
              <Star size={12} />
              <span className="text-cream font-semibold text-base">475</span>
            </div>
            <span className="text-cream/40 text-[9px] uppercase tracking-wider">
              {language === "es" ? "Puntos" : "Points"}
            </span>
          </div>
          <div className="w-px h-8 bg-charcoal-light" />
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-status-urgent">
              <Flame size={12} />
              <span className="text-cream font-semibold text-base">7</span>
            </div>
            <span className="text-cream/40 text-[9px] uppercase tracking-wider">
              {language === "es" ? "Racha" : "Streak"}
            </span>
          </div>
          <div className="w-px h-8 bg-charcoal-light" />
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1 text-gold">
              <Trophy size={12} />
              <span className="text-cream font-semibold text-base">6</span>
            </div>
            <span className="text-cream/40 text-[9px] uppercase tracking-wider">
              {language === "es" ? "Logros" : "Badges"}
            </span>
          </div>
        </div>
      </div>

      {/* Badges section */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {language === "es" ? "Mis Logros" : "My Badges"}
          </p>
          <button
            onClick={() => setActiveSection("achievements")}
            className="text-gold text-xs flex items-center gap-1"
          >
            {language === "es" ? "Ver todos" : "View all"} →
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {DEMO_BADGES.map((badge, i) => (
            <button
              key={i}
              onClick={() => setActiveSection("achievements")}
              className="flex flex-col items-center gap-1 rounded-xl bg-card border border-border p-2 hover:border-gold/40 transition-all active:scale-95"
            >
              <span className="text-2xl leading-none">{badge.icon}</span>
              <span className="text-[8px] text-muted-foreground text-center leading-tight truncate w-full">{badge.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Info placeholder */}
      <div className="mx-4 mt-5">
        <PlaceholderSection
          titleKey="profile"
          icon={<User size={32} />}
          description={language === "es" ? "Configuración de perfil, propiedades asignadas y preferencias de idioma." : "Profile settings, assigned properties, and language preferences — coming soon."}
        />
      </div>
    </div>
  );
}
