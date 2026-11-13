import { useCallback, useEffect, useState } from "react";

export type SwipeSide = "left" | "right";

export function useNotificationSwipe(resetWhen?: unknown) {
  const [revealed, setRevealed] = useState<{ id: string; side: SwipeSide } | null>(null);
  const [resetEpoch, setResetEpoch] = useState(0);
  const closeRevealed = useCallback(() => {
    setRevealed(null);
    setResetEpoch(value => value + 1);
  }, []);
  const reveal = useCallback((id: string, side: SwipeSide = "left") => {
    closeRevealed();
    setRevealed({ id, side });
  }, [closeRevealed]);
  useEffect(() => { closeRevealed(); }, [resetWhen, closeRevealed]);
  useEffect(() => {
    // Dashboard scrolls in the app container rather than inside its card.
    window.addEventListener("scroll", closeRevealed, true);
    return () => window.removeEventListener("scroll", closeRevealed, true);
  }, [closeRevealed]);
  return { revealedId: revealed?.id ?? null, revealedSide: revealed?.side ?? "left" as SwipeSide, resetEpoch, closeRevealed, reveal };
}
