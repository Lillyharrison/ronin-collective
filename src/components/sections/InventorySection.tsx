import { useLanguage } from "@/contexts/LanguageContext";
import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Package } from "lucide-react";

export function InventorySection() {
  const { t } = useLanguage();
  return (
    <PlaceholderSection
      titleKey="inventory"
      icon={<Package size={36} />}
      description={t("trackVehicles")}
    />
  );
}
