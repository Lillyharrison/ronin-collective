import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ClockCard } from './ClockCard';
import { clockTileState, runningTime, showClockTile } from './clockTile';
import type { ClockStatus } from './clockLogic';

/** Home-screen shortcut for Clock in/out. Polls only while mounted; opens the full clock flow in a sheet. */
export function ClockQuickAction({ quickActions, es }: { quickActions: string[] | null; es: boolean }) {
  const { user } = useAuth(); const userId = user?.id;
  const { clockSheetRequested, setClockSheetRequested } = useNavigation();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const isMobile = useIsMobile();
  const status = useQuery({
    queryKey: ['clock-status', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_clock_status' as never);
      if (error) throw error;
      return data as unknown as ClockStatus;
    },
    staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 60000, refetchIntervalInBackground: false,
  });
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const visible = showClockTile(quickActions, status.data);
  // A clock reminder (bell, dashboard card or push link ?clock=1) opens the sheet.
  useEffect(() => {
    if (!visible) return;
    if (clockSheetRequested || params.get('clock')) {
      setOpen(true); setClockSheetRequested(false);
      if (params.get('clock')) { const next = new URLSearchParams(params); next.delete('clock'); setParams(next, { replace: true }); }
    }
  }, [visible, clockSheetRequested, params, setParams, setClockSheetRequested]);
  if (!visible) return null;
  const s = status.data; const state = clockTileState(s);
  const title = es ? 'Fichar' : 'Clock in';
  const body = <ClockCard onEnded={() => setOpen(false)} />;
  return <>
    <button type="button" data-testid="clock-tile" data-state={state} onClick={() => setOpen(true)}
      className="flex flex-col items-center justify-center gap-2 bg-card border border-border rounded-xl p-4 min-h-[88px] hover:border-gold/40 hover:bg-gold/5 transition-all active:scale-95">
      {state === 'open' && s?.open ? <>
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><span aria-hidden className="w-2 h-2 rounded-full bg-status-done" />{es ? `Fichado ${runningTime(s.open.clock_in, now, true)}` : `Clocked in ${runningTime(s.open.clock_in, now, false)}`}</span>
        <span className="text-xs font-semibold text-gold">{es ? 'Terminar' : 'End'}</span>
      </> : state === 'done' ? <>
        <span className="text-gold"><CheckCircle2 size={26} /></span>
        <span className="text-xs font-medium text-foreground text-center leading-tight">{es ? 'Listo por hoy' : 'Done today'}</span>
      </> : <>
        <span className="text-gold"><Play size={26} /></span>
        <span className="text-xs font-medium text-foreground text-center leading-tight">{title}</span>
      </>}
    </button>
    {isMobile ? (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col p-0">
          <SheetTitle className="sr-only">{title}</SheetTitle><SheetDescription className="sr-only">{es ? 'Tu visita' : 'Your visit'}</SheetDescription>
          <div className="overflow-y-auto flex-1 pt-8">{body}</div>
        </SheetContent>
      </Sheet>
    ) : (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col p-0 pt-8">
          <DialogTitle className="sr-only">{title}</DialogTitle><DialogDescription className="sr-only">{es ? 'Tu visita' : 'Your visit'}</DialogDescription>
          <div className="overflow-y-auto flex-1">{body}</div>
        </DialogContent>
      </Dialog>
    )}
  </>;
}
