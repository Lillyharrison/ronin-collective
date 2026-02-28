import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Building2 } from "lucide-react";

export function PropertySection() {
  return (
    <PlaceholderSection
      titleKey="property"
      icon={<Building2 size={36} />}
      description="Select a property to view its dashboard, staff, tasks and systems."
    />
  );
}
