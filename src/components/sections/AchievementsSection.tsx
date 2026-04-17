import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { fireConfetti, fireMiniConfetti } from "@/lib/confetti";
import { Trophy, Flame, Star, Zap, Target, ChevronRight } from "lucide-react";

interface Achievement {
  id: string;
  key: string;
  title_en: string;
  title_es: string | null;
  description_en: string | null;
  description_es: string | null;
  icon: string;
  points: number;
  category: string;
}

interface UserStats {
  points_total: number;
  current_streak: number;
  longest_streak: number;
  tasks_completed: number;
  badges_earned: string[];
}

// Mock stats for demo (until auth is wired up)
const DEMO_STATS: UserStats = {
  points_total: 0,
  current_streak: 0,
  longest_streak: 0,
  tasks_completed: 0,
  badges_earned: [],
};

const categoryColors: Record<string, string> = {
  task:      "bg-[hsl(var(--status-done)/0.12)] border-[hsl(var(--status-done)/0.3)] text-[hsl(var(--status-done))]",
  streak:    "bg-[hsl(var(--status-urgent)/0.1)] border-[hsl(var(--status-urgent)/0.3)] text-[hsl(var(--status-urgent))]",
  milestone: "bg-gold/10 border-gold/30 text-gold",
  special:   "bg-[hsl(var(--status-progress)/0.1)] border-[hsl(var(--status-progress)/0.3)] text-[hsl(var(--status-progress))]",
};

export function AchievementsSection() {
  const { language } = useLanguage();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats] = useState<UserStats>(DEMO_STATS);
  const [activeTab, setActiveTab] = useState<"earned" | "all">("earned");
  const [justEarned, setJustEarned] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("achievements")
      .select("id, key, title_en, title_es, description_en, description_es, icon, points, category")
      .order("points", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setAchievements(data as Achievement[]);
        setLoading(false);
      });
  }, []);

  const earned = achievements.filter((a) => stats.badges_earned.includes(a.key));
  const unearned = achievements.filter((a) => !stats.badges_earned.includes(a.key));
  const displayed = activeTab === "earned" ? earned : achievements;

  // Demo: simulate earning a badge
  const simulateEarn = (key: string) => {
    setJustEarned(key);
    if (key === "all_tasks_day") {
      fireConfetti();
    } else {
      fireMiniConfetti(0.5, 0.4);
    }
    setTimeout(() => setJustEarned(null), 3000);
  };

  const title = (a: Achievement) => (language === "es" && a.title_es) ? a.title_es : a.title_en;
  const desc  = (a: Achievement) => (language === "es" && a.description_es) ? a.description_es : a.description_en;

  return (
    <div className="animate-fade-in pb-4">
      {/* Hero stats bar */}
      <div className="bg-charcoal px-5 pt-6 pb-5 border-b border-charcoal-light">
        <p className="text-cream/50 text-xs tracking-widest uppercase mb-1">
          {language === "es" ? "Tu Progreso" : "Your Progress"}
        </p>
        <h1 className="font-display text-3xl text-cream mb-4">
          {language === "es" ? "Logros" : "Achievements"}
        </h1>

        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: <Star size={16} className="text-gold" />, value: stats.points_total, label: language === "es" ? "Puntos" : "Points" },
            { icon: <Flame size={16} className="text-status-urgent" />, value: stats.current_streak, label: language === "es" ? "Racha" : "Streak" },
            { icon: <Trophy size={16} className="text-gold" />, value: earned.length, label: language === "es" ? "Logros" : "Badges" },
            { icon: <Target size={16} className="text-status-done" />, value: stats.tasks_completed, label: language === "es" ? "Tareas" : "Tasks" },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl bg-charcoal-light border border-charcoal-muted p-2.5 flex flex-col items-center gap-1">
              {stat.icon}
              <span className="text-cream font-semibold text-lg leading-none">{stat.value}</span>
              <span className="text-cream/40 text-[9px] tracking-wide uppercase leading-none">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Streak banner */}
      {stats.current_streak >= 3 && (
        <div className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-[hsl(var(--status-urgent)/0.15)] to-gold/10 border border-[hsl(var(--status-urgent)/0.3)] px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {stats.current_streak}-{language === "es" ? "día de racha" : "day streak"}
            </p>
            <p className="text-xs text-muted-foreground">
              {language === "es" ? `¡Mejor racha: ${stats.longest_streak} días!` : `Personal best: ${stats.longest_streak} days!`}
            </p>
          </div>
          <Zap size={18} className="text-gold ml-auto" />
        </div>
      )}

      {/* Tab switcher */}
      <div className="mx-4 mt-4 flex rounded-xl bg-muted p-1">
        {(["earned", "all"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {tab === "earned"
              ? `${language === "es" ? "Ganados" : "Earned"} (${earned.length})`
              : language === "es" ? "Todos" : "All"}
          </button>
        ))}
      </div>

      {/* Badge grid */}
      <div className="px-4 mt-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {displayed.map((a) => {
              const isEarned = stats.badges_earned.includes(a.key);
              const isNew = justEarned === a.key;
              const colorClass = categoryColors[a.category] ?? categoryColors.task;

              return (
                <button
                  key={a.id}
                  onClick={() => !isEarned && simulateEarn(a.key)}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                    isEarned
                      ? `${colorClass} shadow-sm`
                      : "bg-muted/50 border-border opacity-40 grayscale"
                  } ${isNew ? "scale-105 ring-2 ring-gold ring-offset-2 ring-offset-background" : ""}`}
                >
                  {isNew && (
                    <span className="absolute -top-1.5 -right-1.5 bg-gold text-charcoal text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      New!
                    </span>
                  )}
                  <span className="text-3xl leading-none">{a.icon}</span>
                  <span className="text-[10px] font-semibold text-center leading-tight">{title(a)}</span>
                  <span className="text-[9px] opacity-70 flex items-center gap-0.5">
                    <Star size={8} /> {a.points}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Unearned count */}
      {activeTab === "earned" && unearned.length > 0 && (
        <button
          onClick={() => setActiveTab("all")}
          className="mx-4 mt-4 w-[calc(100%-2rem)] flex items-center justify-between rounded-xl bg-card border border-border px-4 py-3"
        >
          <span className="text-sm text-muted-foreground">
            {unearned.length} {language === "es" ? "logros más por desbloquear" : "more badges to unlock"}
          </span>
          <ChevronRight size={16} className="text-gold" />
        </button>
      )}

      {/* Demo confetti button */}
      <div className="mx-4 mt-6 rounded-xl bg-charcoal border border-charcoal-light p-4">
        <p className="text-cream/50 text-[10px] tracking-widest uppercase mb-3">
          {language === "es" ? "Demo — Animación de Confeti" : "Demo — Confetti Preview"}
        </p>
        <button
          onClick={() => fireConfetti()}
          className="w-full py-3 rounded-xl bg-gold/20 border border-gold/40 text-gold text-sm font-semibold hover:bg-gold/30 transition-colors active:scale-95"
        >
          🎉 {language === "es" ? "Simular Día Perfecto" : "Simulate Perfect Day"}
        </button>
      </div>
    </div>
  );
}
