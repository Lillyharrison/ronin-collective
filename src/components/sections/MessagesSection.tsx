import { PlaceholderSection } from "@/components/PlaceholderSection";
import { MessageCircle } from "lucide-react";

export function MessagesSection() {
  return (
    <PlaceholderSection
      titleKey="messages"
      icon={<MessageCircle size={36} />}
      description="WhatsApp-style threads across properties, staff, and the AI assistant."
    />
  );
}
