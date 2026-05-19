// Shared constants for the Staff Calendar feature.
// Extracted from StaffCalendarTab.tsx (Step 1 refactor) — no behavior changes.
// Property color mapping is locked per mem://style/property-colors.

export const PROPERTY_COLORS = [
  { bg: "bg-blue-500/15 border-blue-500/30",    text: "text-blue-400",    dot: "bg-blue-400" },
  { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400" },
  { bg: "bg-purple-500/15 border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
  { bg: "bg-orange-500/15 border-orange-500/30", text: "text-orange-400", dot: "bg-orange-400" },
  { bg: "bg-pink-500/15 border-pink-500/30",    text: "text-pink-400",    dot: "bg-pink-400" },
  { bg: "bg-cyan-500/15 border-cyan-500/30",    text: "text-cyan-400",    dot: "bg-cyan-400" },
  { bg: "bg-amber-500/15 border-amber-500/30",  text: "text-amber-400",   dot: "bg-amber-400" },
  { bg: "bg-rose-500/15 border-rose-500/30",    text: "text-rose-400",    dot: "bg-rose-400" },
  { bg: "bg-teal-500/15 border-teal-500/30",    text: "text-teal-400",    dot: "bg-teal-400" },
  { bg: "bg-indigo-500/15 border-indigo-500/30", text: "text-indigo-400", dot: "bg-indigo-400" },
  { bg: "bg-slate-300/20 border-slate-300/40",  text: "text-slate-300",   dot: "bg-slate-300" },
];

/** Explicit color assignments for key properties to avoid similar-looking colors */
export const PROPERTY_COLOR_OVERRIDES: Record<string, number> = {
  rockingham: 0, // blue
  moreno: 3,     // orange
  bristol: 5,    // cyan
  franklyn: 1,   // emerald
  toyopa: 2,     // purple
  wisconsin: 4,  // pink
  broadbeach: 6, // amber
  montana: 7,    // rose
  grosvenor: 8,  // teal
  aman: 9,       // indigo
};

export const LEAVE_TYPES = ["vacation", "sick", "personal", "public_holiday", "other"];
export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const LEAVE_TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  vacation:       { label: "Vacation",        emoji: "🌴", color: "text-blue-400" },
  sick:           { label: "Sick Leave",       emoji: "🤒", color: "text-red-400" },
  personal:       { label: "Personal Day",     emoji: "🧘", color: "text-purple-400" },
  public_holiday: { label: "Public Holiday",   emoji: "🎉", color: "text-amber-400" },
  other:          { label: "Other",            emoji: "📋", color: "text-muted-foreground" },
};
