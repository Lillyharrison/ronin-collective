import { PlaceholderSection } from "@/components/PlaceholderSection";
import { UsersRound } from "lucide-react";

export function MeetTeamSection() {
  return (
    <PlaceholderSection
      titleKey="meetTeam"
      icon={<UsersRound size={36} />}
      description="Family org chart, staff profiles, roles, and assigned properties."
    />
  );
}
