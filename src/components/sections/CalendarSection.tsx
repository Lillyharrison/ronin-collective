import { useLanguage } from "@/contexts/LanguageContext";
import { PlaceholderSection } from "@/components/PlaceholderSection";
import { CalendarDays } from "lucide-react";

export function CalendarSection() {
  const { t } = useLanguage();
  return (
    <PlaceholderSection
      titleKey="calendar"
      icon={<CalendarDays size={36} />}
      description={t("layeredCalendar")}
    />
  );
}
