import { PlaceholderSection } from "@/components/PlaceholderSection";
import { Package } from "lucide-react";

export function InventorySection() {
  return (
    <PlaceholderSection
      titleKey="inventory"
      icon={<Package size={36} />}
      description="Track vehicles, art, appliances and tech across all properties with QR codes."
    />
  );
}
