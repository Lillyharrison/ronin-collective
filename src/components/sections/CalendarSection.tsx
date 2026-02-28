import { PlaceholderSection } from "@/components/PlaceholderSection";
import { CalendarDays } from "lucide-react";

export function CalendarSection() {
  return (
    <PlaceholderSection
      titleKey="calendar"
      icon={<CalendarDays size={36} />}
      description="Layered calendar: principal arrivals, vendor visits, and project timelines."
    />
  );
}
