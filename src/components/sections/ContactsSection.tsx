import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Users } from "lucide-react";

export function ContactsSection() {
  return (
    <PlaceholderSection
      titleKey="contacts"
      icon={<Users size={36} />}
      description="Trusted vendors, contractors, and emergency contacts for each property."
    />
  );
}
