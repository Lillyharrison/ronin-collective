import { useParams } from "react-router-dom";
import GanttChart from "@/components/GanttChart";

export default function SharedTimeline() {
  const { token } = useParams<{ token: string }>();

  if (!token || token.length < 16) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f2f2] text-[#1a1a1a] p-6 text-center font-sans">
        <div>
          <h1 className="text-lg font-semibold mb-2">Invalid share link</h1>
          <p className="text-sm text-[#666]">The link you opened is missing or malformed.</p>
        </div>
      </div>
    );
  }

  return <GanttChart shareToken={token} />;
}
