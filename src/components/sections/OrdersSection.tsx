import { PlaceholderSection } from "@/components/PlaceholderSection";
import { ShoppingCart } from "lucide-react";

export function OrdersSection() {
  return (
    <PlaceholderSection
      titleKey="orders"
      icon={<ShoppingCart size={36} />}
      description="Grocery runs, household supply orders, and delivery tracking."
    />
  );
}
