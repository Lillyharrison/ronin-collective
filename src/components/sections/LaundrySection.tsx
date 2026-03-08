import { useLanguage } from "@/contexts/LanguageContext";
import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Shirt } from "lucide-react";

export function LaundrySection() {
  const { t } = useLanguage();
  return (
    <PlaceholderSection
      titleKey="laundry"
      icon={<Shirt size={36} />}
      description={t("laundryDesc")}
    />
  );
}
