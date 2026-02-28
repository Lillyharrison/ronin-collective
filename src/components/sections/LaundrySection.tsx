import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Shirt } from "lucide-react";

export function LaundrySection() {
  return (
    <PlaceholderSection
      titleKey="laundry"
      icon={<Shirt size={36} />}
      description="Track laundry cycles, linen inventory, and dry-cleaning schedules."
    />
  );
}
