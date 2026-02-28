import { useLanguage } from "@/contexts/LanguageContext";
import { TranslationKey } from "@/lib/i18n";
import { Construction } from "lucide-react";

interface PlaceholderSectionProps {
  titleKey: TranslationKey;
  icon: React.ReactNode;
  description?: string;
}

export function PlaceholderSection({ titleKey, icon, description }: PlaceholderSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-5 text-gold">
        {icon}
      </div>
      <h2 className="font-display text-3xl text-foreground mb-2">{t(titleKey)}</h2>
      <p className="text-muted-foreground text-sm mb-4">
        {description ?? t("sectionUnderConstruction")}
      </p>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-charcoal/5 border border-border">
        <Construction size={14} className="text-gold" />
        <span className="text-xs text-muted-foreground tracking-wider uppercase">{t("comingSoon")}</span>
      </div>
    </div>
  );
}
