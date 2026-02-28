import { PlaceholderSection } from "@/components/PlaceholderSection";
import { CheckSquare } from "lucide-react";

export function TasksSection() {
  return (
    <PlaceholderSection
      titleKey="tasks"
      icon={<CheckSquare size={36} />}
      description="Daily task lists filtered by property and staff member, with photo completion."
    />
  );
}
