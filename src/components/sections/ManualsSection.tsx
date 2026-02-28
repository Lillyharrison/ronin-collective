import { PlaceholderSection } from "@/components/PlaceholderSection";
import { BookOpen } from "lucide-react";

export function ManualsSection() {
  return (
    <PlaceholderSection
      titleKey="manuals"
      icon={<BookOpen size={36} />}
      description="Property SOPs, housekeeping guides, and how-to documents. Upload via drag & drop."
    />
  );
}
