import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SwipeableNotificationRow({ revealed, resetEpoch, removing, onReveal, onClose, onAction, actionLabel, ariaLabel = actionLabel, actionIcon: ActionIcon, destructive = false, children }: {
  revealed: boolean; resetEpoch: number; removing: boolean; onReveal: () => void;
  onClose: () => void; onAction: () => void; actionLabel: string; ariaLabel?: string; actionIcon: LucideIcon; destructive?: boolean; children: ReactNode;
}) {
  const gesture = useRef<{ x: number; y: number; start: number; axis: "x" | "y" | null; offset: number } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  useEffect(() => { gesture.current = null; setOffset(null); }, [resetEpoch]);
  return <div className={cn("notification-collapse grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", removing && "grid-rows-[0fr] opacity-0 pointer-events-none")}>
    <div className="min-h-0 overflow-hidden">
      <div className="notification-swipe-row relative isolate overflow-hidden" data-revealed={revealed}>
        <Button variant={destructive ? "destructive" : "secondary"} size="icon" aria-label={ariaLabel} title={actionLabel} disabled={removing}
          tabIndex={revealed ? 0 : -1} aria-hidden={!revealed}
          className={cn("notification-touch-delete absolute right-3 top-1/2 z-0 h-14 w-14 -translate-y-1/2 rounded-full [&_svg]:size-[22px]", !revealed && "invisible", destructive && "text-notification-delete-foreground")}
          onClick={e => { e.stopPropagation(); onAction(); }}><ActionIcon aria-hidden="true" /></Button>
        <div className={cn("notification-swipe-content relative z-10 bg-card touch-pan-y transition-transform duration-200 motion-reduce:transition-none", offset !== null && "transition-none")}
          style={{ transform: `translateX(${offset ?? (revealed ? -80 : 0)}px)` }}
          onTouchStart={e => {
            suppressClick.current = false;
            if (e.touches.length !== 1 || removing) return;
            const touch = e.touches[0];
            gesture.current = { x: touch.clientX, y: touch.clientY, start: revealed ? -80 : 0, axis: null, offset: revealed ? -80 : 0 };
          }}
          onTouchMove={e => {
            const current = gesture.current;
            if (!current || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - current.x;
            const dy = e.touches[0].clientY - current.y;
            if (!current.axis) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
              if (Math.abs(dy) >= Math.abs(dx)) current.axis = "y";
              else if (Math.abs(dx) > Math.abs(dy) * 1.5) current.axis = "x";
              else return;
            }
            if (current.axis !== "x") return;
            current.offset = Math.max(-80, Math.min(0, current.start + dx));
            setOffset(current.offset);
          }}
          onTouchEnd={e => {
            const current = gesture.current;
            gesture.current = null;
            setOffset(null);
            if (current?.axis !== "x") return;
            e.preventDefault(); // Do not synthesize a notification click after a swipe.
            suppressClick.current = true;
            if (current.offset <= -40) onReveal(); else onClose();
          }}
          onTouchCancel={() => { gesture.current = null; setOffset(null); }}
          onClickCapture={e => {
            if (suppressClick.current && e.detail !== 0) { e.stopPropagation(); suppressClick.current = false; return; }
            if (revealed) { e.stopPropagation(); onClose(); }
          }}
          onKeyDownCapture={e => {
            if (revealed && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); onClose(); }
          }}
        ><div className="group flex items-start">
          {children}
          <Button variant="ghost" size="icon" aria-label={ariaLabel} title={actionLabel} disabled={removing}
            onClick={e => { e.stopPropagation(); onAction(); }}
            className={cn("notification-desktop-delete my-2 mr-2 h-11 w-11 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground", destructive ? "hover:text-destructive hover:bg-destructive/10" : "hover:text-foreground hover:bg-muted")}>
            <ActionIcon aria-hidden="true" />
          </Button>
        </div></div>
      </div>
    </div>
  </div>;
}

