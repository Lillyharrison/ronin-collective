import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek } from "date-fns";
import { toast } from "sonner";

/** Monday-start week key for a given date string / date. */
export function weekKeyOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/**
 * Tracks which schedule weeks (Monday keys) have been published.
 * Unpublished weeks are hidden from staff / family in the calendar UI.
 */
export function useSchedulePublications(rangeStart: Date, rangeEnd: Date) {
  const [publishedWeeks, setPublishedWeeks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fromStr = weekKeyOf(rangeStart);
  const toStr = format(rangeEnd, "yyyy-MM-dd");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff_schedule_publications")
      .select("week_start")
      .gte("week_start", fromStr)
      .lte("week_start", toStr)
      .limit(500);
    setPublishedWeeks(new Set((data ?? []).map((r) => r.week_start as string)));
    setLoading(false);
  }, [fromStr, toStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("staff-schedule-publications")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_schedule_publications" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const publishWeek = async (weekStart: Date, userId: string | null) => {
    const key = weekKeyOf(weekStart);
    const { error } = await supabase
      .from("staff_schedule_publications")
      .insert({ week_start: key, published_by: userId } as never);
    if (error) { toast.error("Failed to publish week"); return false; }
    toast.success("Week published — now visible to staff & family");
    await fetchData();
    return true;
  };

  const unpublishWeek = async (weekStart: Date) => {
    const key = weekKeyOf(weekStart);
    const { error } = await supabase
      .from("staff_schedule_publications")
      .delete()
      .eq("week_start", key);
    if (error) { toast.error("Failed to unpublish week"); return false; }
    toast.success("Week hidden from staff & family");
    await fetchData();
    return true;
  };

  const isPublished = useCallback(
    (date: Date | string) => publishedWeeks.has(weekKeyOf(date)),
    [publishedWeeks],
  );

  return { publishedWeeks, isPublished, loading, publishWeek, unpublishWeek, refetch: fetchData };
}
