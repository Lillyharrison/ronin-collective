import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Wrench } from "lucide-react";

export function MaintenanceSection() {
  return (
    <PlaceholderSection
      titleKey="maintenance"
      icon={<Wrench size={36} />}
      description="Report issues, track repairs, and manage vendor visits."
    />
  );
}
