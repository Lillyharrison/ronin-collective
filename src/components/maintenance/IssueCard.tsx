import { MapPin, Clock, User, Link as LinkIcon, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { IssueStatusBadge, IssuePriorityBadge } from "./IssueStatusBadge";
import type { MaintenanceIssue } from "@/hooks/useMaintenanceIssues";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  issue: MaintenanceIssue;
  onClick: () => void;
  compact?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  "Plumbing": "🔵",
  "Electrical / Tech": "⚡",
  "Climate / HVAC": "❄️",
  "Outdoor / Grounds": "🌿",
  "Appliances": "🏠",
  "Structural": "🧱",
  "Security": "🔒",
  "Pool": "🏊",
  "Furniture": "🛋️",
  "General": "🔧",
};

export function IssueCard({ issue, onClick, compact = false }: Props) {
  const daysOpen = Math.floor(
    (Date.now() - new Date(issue.created_at).getTime()) / 86400000
  );
  const icon = CATEGORY_ICONS[issue.category] ?? "🔧";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-card border border-border rounded-xl overflow-hidden",
        "hover:border-gold/30 hover:shadow-sm transition-all active:scale-[0.99] group",
        issue.priority === "urgent" && "border-l-4 border-l-[hsl(var(--status-urgent))]",
        issue.priority === "high" && "border-l-4 border-l-orange-400",
      )}
    >
      {/* Photo strip — full height for non-compact, compact thumb via row layout */}
      {!compact && issue.photo_url && (
        <div className="relative h-32 bg-muted overflow-hidden">
          <img
            src={issue.photo_url}
            alt={issue.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <IssueStatusBadge status={issue.status} size="xs" />
          </div>
          {issue.related_issue_id && (
            <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1" title="Recurring issue">
              <LinkIcon size={10} className="text-amber-400" />
            </div>
          )}
        </div>
      )}

      {/* Compact card: thumbnail on the left, content on the right */}
      {compact ? (
        <div className="flex gap-3 p-3">
          {issue.photo_url ? (
            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted">
              <img
                src={issue.photo_url}
                alt={issue.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-2xl">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{issue.title}</p>
              <IssueStatusBadge status={issue.status} size="xs" />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
              {issue.property_name && (
                <span className="flex items-center gap-1"><MapPin size={9} /> {issue.property_name}</span>
              )}
              {issue.location_detail && (
                <span className="text-muted-foreground/60">· {issue.location_detail}</span>
              )}
              <span className="flex items-center gap-1 ml-auto">
                <Clock size={9} />
                {daysOpen === 0
                  ? formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })
                  : `${daysOpen}d open`}
              </span>
            </div>
            {issue.scheduled_date && (
              <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded-md px-1.5 py-0.5 w-fit">
                <CalendarClock size={9} className="text-blue-400 flex-shrink-0" />
                <span className="text-[10px] font-medium text-blue-400">
                  {format(new Date(issue.scheduled_date), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {/* Header row */}
          <div className="flex items-start gap-2">
            <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm leading-snug truncate pr-1">{issue.title}</p>
              {issue.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{issue.description}</p>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <IssueStatusBadge status={issue.status} />
            <IssuePriorityBadge priority={issue.priority} />
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {issue.category}
            </span>
          </div>

          {/* Scheduled date pill — prominently shown when set */}
          {issue.scheduled_date && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5 w-fit">
              <CalendarClock size={11} className="text-blue-400 flex-shrink-0" />
              <span className="text-[11px] font-medium text-blue-400">
                {format(new Date(issue.scheduled_date), "MMM d, yyyy")}
              </span>
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            {issue.property_name && (
              <span className="flex items-center gap-1"><MapPin size={9} /> {issue.property_name}</span>
            )}
            {issue.location_detail && (
              <span className="flex items-center gap-1 text-muted-foreground/70">· {issue.location_detail}</span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Clock size={9} />
              {daysOpen === 0
                ? formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })
                : `${daysOpen}d open`}
            </span>
          </div>

          {/* Assignee */}
          {issue.assignee_name && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {issue.assignee_avatar
                ? <img src={issue.assignee_avatar} alt={issue.assignee_name} className="w-4 h-4 rounded-full object-cover" />
                : <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center"><User size={8} /></div>
              }
              <span>{issue.assignee_name}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
