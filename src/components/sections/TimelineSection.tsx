import { ArrowLeft } from "lucide-react";
import { useNavigation } from "@/contexts/NavigationContext";
import GanttChart from "@/components/GanttChart";

export function TimelineSection() {
  const { goBack } = useNavigation();
  return (
    <div className="px-4 pt-3 pb-6">
      <button
        onClick={goBack}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-cream/80 hover:text-gold hover:bg-charcoal-light transition-colors text-sm font-medium mb-3"
        aria-label="Go back"
      >
        <ArrowLeft size={18} />
        Back
      </button>
      <GanttChart />
    </div>
  );
}
