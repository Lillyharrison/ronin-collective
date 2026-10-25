import { useCallback, useEffect, useState } from "react";

export function useNotificationSwipe(resetWhen?: unknown) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [resetEpoch, setResetEpoch] = useState(0);
  const closeRevealed = useCallback(() => {
    setRevealedId(null);
    setResetEpoch(value => value + 1);
  }, []);
  const reveal = useCallback((id: string) => { closeRevealed(); setRevealedId(id); }, [closeRevealed]);
  useEffect(() => { closeRevealed(); }, [resetWhen, closeRevealed]);
  useEffect(() => {
    // Dashboard scrolls in the app container rather than inside its card.
    window.addEventListener("scroll", closeRevealed, true);
    return () => window.removeEventListener("scroll", closeRevealed, true);
  }, [closeRevealed]);
  return { revealedId, resetEpoch, closeRevealed, reveal };
}