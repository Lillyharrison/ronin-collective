import { useNavigation } from "@/contexts/NavigationContext";
import GanttChart from "@/components/GanttChart";

export function TimelineSection() {
  const { goBack } = useNavigation();
  return (
    <div className="px-4 pb-6">
      <GanttChart onBack={goBack} />
    </div>
  );
}
