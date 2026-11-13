import { clockState, type ClockStatus } from './clockLogic';

export type ClockTileState = 'idle' | 'open' | 'done';

/** At-a-glance state for the home-screen clock shortcut. */
export function clockTileState(s: ClockStatus | null | undefined): ClockTileState {
  if (!s?.enabled) return 'idle';
  if (s.open) return 'open';
  return clockState(s) === 'done' ? 'done' : 'idle';
}

/** Running time since clock-in: "2h 15m" / "2 h 15 min". */
export function runningTime(clockIn: string, now: Date, es: boolean) {
  const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(clockIn)) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return es ? `${h} h ${m} min` : `${h}h ${m}m`;
}

/** The tile shows only with the 'clock' shortcut AND clocking enabled for this person. */
export function showClockTile(quickActions: string[] | null | undefined, status: ClockStatus | null | undefined) {
  return Array.isArray(quickActions) && quickActions.includes('clock') && !!status?.enabled;
}
