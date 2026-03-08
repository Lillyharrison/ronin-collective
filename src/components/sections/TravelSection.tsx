import { useLanguage } from "@/contexts/LanguageContext";
import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Plane } from "lucide-react";

export function TravelSection() {
  const { t } = useLanguage();
  return (
    <PlaceholderSection
      titleKey="travel"
      icon={<Plane size={36} />}
      description={t("travelDesc")}
    />
  );
}
