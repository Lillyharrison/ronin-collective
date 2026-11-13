import { isInternalCaller, signedInUserId, unauthorized } from "../_shared/internalAuth.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseICalDateProp, icalToStored } from "../_shared/eventTime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

// Keywords that mark an event as estate-relevant (visible to staff)
const ESTATE_KEYWORDS = [
  "travel", "trip", "flight", "arrival", "departure",
  "guest", "visitor", "family", "party", "dinner", "event",
  "maintenance", "contractor", "vendor", "inspection",
  "vacation", "holiday", "montana", "hamptons", "beach", "ski",
  "cleaning", "service", "appointment", "meeting", "estate",
];

// Keywords that should always be private (personal/medical)
const PRIVATE_KEYWORDS = [
  "doctor", "gym", "workout", "dentist", "therapy",
  "personal", "private", "kids", "school", "pickup", "dropoff",
  "pharmacy", "medical", "confidential",
];

function unescapeIcal(val: string): string {
  return val
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function isEstateRelevant(title: string, description: string, customKeywords: string[]): boolean {
  const text = `${title} ${description}`.toLowerCase();
  // Check private first — private overrides estate relevance
  if (PRIVATE_KEYWORDS.some((kw) => text.includes(kw))) return false;
  // Check estate keywords + admin custom keywords
  const allKeywords = [...ESTATE_KEYWORDS, ...customKeywords.map((k) => k.toLowerCase())];
  return allKeywords.some((kw) => text.includes(kw));
}

function detectEventType(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (/(travel|trip|flight|arrival|departure|vacation|montana|hamptons|ski|beach)/.test(text)) return "travel";
  if (/(guest|visitor|family|stay)/.test(text)) return "guest_stay";
  if (/(party|dinner|event|celebration|gathering)/.test(text)) return "event";
  if (/(maintenance|contractor|vendor|inspection|repair|service)/.test(text)) return "maintenance";
  return "general";
}

function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  return ESTATE_KEYWORDS.filter((kw) => text.includes(kw));
}

interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  isPrivate: boolean;
}

function parseICalFeed(icalText: string, customPrivateKeywords: string[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icalText.replace(/\r\n /g, "").replace(/\r\n\t/g, "").split(/\r\n|\n|\r/);

  let inEvent = false;
  let current: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
    } else if (line === "END:VEVENT") {
      inEvent = false;
      const uid = current["UID"] || "";
      const title = unescapeIcal(current["SUMMARY"] || "");
      const description = unescapeIcal(current["DESCRIPTION"] || "");
      const location = unescapeIcal(current["LOCATION"] || "");
      const startParsed = current["DTSTART"] ? parseICalDateProp(current["DTSTART__params"] ?? "", current["DTSTART"]) : null;
      const endParsed = current["DTEND"] ? parseICalDateProp(current["DTEND__params"] ?? "", current["DTEND"]) : null;
      const stored = startParsed ? icalToStored(startParsed, endParsed) : null;
      const start = stored?.start_date ?? null;
      const end = stored?.end_date ?? null;
      const allDay = stored?.all_day ?? false;
      const allPrivate = [...PRIVATE_KEYWORDS, ...customPrivateKeywords.map((k) => k.toLowerCase())];
      const text = `${title} ${description}`.toLowerCase();
      const isPrivate = allPrivate.some((kw) => text.includes(kw));

      if (uid && title) {
        events.push({ uid, title, description, location, start, end, allDay, isPrivate });
      }
    } else if (inEvent) {
      // Handle property;param=value:value format
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      let key = line.slice(0, colonIdx);
      const val = line.slice(colonIdx + 1);
      // Normalize DTSTART;TZID=...: → DTSTART
      // Keep the parameters (TZID / VALUE=DATE) so dates are read correctly.
      for (const prop of ["DTSTART", "DTEND"]) {
        if (key.startsWith(prop)) {
          current[`${prop}__params`] = key.slice(prop.length);
          key = prop;
        }
      }
      current[key] = val;
    }
  }

  return events;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only signed-in admins / master admins (Calendar settings "Sync now") may run this.
  const uid = await signedInUserId(req);
  if (!uid) return unauthorized(corsHeaders);
  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
  if (!(roleRows ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "master_admin")) return unauthorized(corsHeaders, 403);

  try {
    // Load settings
    const { data: settingsRows } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["ical_url", "ical_private_keywords", "ical_estate_keywords", "ical_property_id"]);

    const settings: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) {
      settings[row.key] = row.value;
    }

    const icalUrl = (settings["ical_url"] as string) || "";
    if (!icalUrl) {
      return new Response(
        JSON.stringify({ error: "No iCal URL configured. Please add one in Calendar Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const propertyId = (settings["ical_property_id"] as string) || null;
    const customPrivateKw: string[] = Array.isArray(settings["ical_private_keywords"])
      ? (settings["ical_private_keywords"] as string[])
      : [];
    const customEstateKw: string[] = Array.isArray(settings["ical_estate_keywords"])
      ? (settings["ical_estate_keywords"] as string[])
      : [];

    // Fetch iCal feed
    let icalText: string;
    try {
      const resp = await fetch(icalUrl, {
        headers: { "User-Agent": "Ronin-CalendarSync/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      icalText = await resp.text();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch iCal feed: ${e instanceof Error ? e.message : String(e)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const events = parseICalFeed(icalText, customPrivateKw);
    let synced = 0;
    let skipped = 0;
    const newEventIds: string[] = [];

    for (const ev of events) {
      if (!ev.start) { skipped++; continue; }

      const estateRelevant = isEstateRelevant(ev.title, ev.description, customEstateKw);
      const eventType = detectEventType(ev.title, ev.description);
      const keywords = extractKeywords(ev.title, ev.description);

      const payload = {
        external_uid: ev.uid,
        title: ev.title,
        description: ev.description || null,
        location: ev.location || null,
        start_date: ev.start,
        end_date: ev.end || null,
        all_day: ev.allDay,
        event_type: eventType,
        is_private: ev.isPrivate || !estateRelevant,
        keywords,
        property_id: propertyId,
        status: "upcoming",
        calendar_source: "ical",
      };

      const { data: upserted, error } = await supabase
        .from("calendar_events")
        .upsert(payload, { onConflict: "external_uid", ignoreDuplicates: false })
        .select("id, title, event_type, is_private, external_uid")
        .single();

      if (error) {
        console.error("Upsert error for", ev.uid, error.message);
        skipped++;
      } else {
        synced++;
        if (upserted && !upserted.is_private && estateRelevant) {
          newEventIds.push(upserted.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        parsed: events.length,
        synced,
        skipped,
        new_event_ids: newEventIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("calendar-sync error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
