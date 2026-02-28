import { PlaceholderSection } from "@/components/PlaceholderSection";
import { User } from "lucide-react";

export function ProfileSection() {
  return (
    <PlaceholderSection
      titleKey="profile"
      icon={<User size={36} />}
      description="Your profile, role, assigned properties, and language preferences."
    />
  );
}
