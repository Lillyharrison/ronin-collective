import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Plane } from "lucide-react";

export function TravelSection() {
  return (
    <PlaceholderSection
      titleKey="travel"
      icon={<Plane size={36} />}
      description="Packing checklists, itineraries, and property prep for upcoming trips."
    />
  );
}
