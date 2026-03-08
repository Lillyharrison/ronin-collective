import { useLanguage } from "@/contexts/LanguageContext";
import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Users } from "lucide-react";

export function ContactsSection() {
  const { t } = useLanguage();
  return (
    <PlaceholderSection
      titleKey="contacts"
      icon={<Users size={36} />}
      description={t("trustedVendors")}
    />
  );
}
