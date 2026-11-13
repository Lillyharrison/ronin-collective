/** Shortcuts shown on the home screen: exactly the saved list, filtered by access.
 *  An empty (or missing) list means no shortcuts — never a default set. */
export function selectShortcuts<T extends { key: string; section: string }>(
  all: T[], saved: string[] | null | undefined, canSee: (section: string) => boolean, isMasterAdmin: boolean,
): T[] {
  const keys = Array.isArray(saved) ? saved : [];
  return all.filter(a => keys.includes(a.key) && (a.key === "requestItem" || isMasterAdmin || canSee(a.section)));
}
