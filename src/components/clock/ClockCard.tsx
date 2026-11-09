import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Play, Square, Home } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { clockState, duration, localParts, manualTime, nearestVisits, safeTimezone, reasons, type ClockStatus } from './clockLogic';
import { enqueue, flushQueue, getLocation, readQueue, remove, type ClockAction, type RpcResult } from './clockQueue';
const invoke = async (name:string,args:Record<string,unknown>):Promise<RpcResult> => {
  // All RPCs are owner-deployed; generated database types may lag their contract.
  const result=await supabase.rpc(name as 'my_clock_status', args as never);
  return { data: result.data as Record<string,unknown>|null, error:result.error };
};
export function ClockCard() {
  const {user}=useAuth(); const {language}=useLanguage(); const {registerBackHandler}=useNavigation();
  const userId=user?.id; const es=language==='es'; const text=(a:string,b:string)=>es?a:b;
  const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false); const lock=useRef(false);
  const [sheet,setSheet]=useState<'location'|'houses'|'time'|'reason'|null>(null);
  const pending=useRef<{rpc:'clock_in'|'clock_out'; property:string|null; at:string; manual:boolean}|null>(null);
  const [hour,setHour]=useState('08'); const [minute,setMinute]=useState('00');
  const [last,setLast]=useState<{action:ClockAction;data:Record<string,unknown>}|null>(null);
  const [reasonEntry,setReasonEntry]=useState<string|null>(null);
  const status=useQuery({queryKey:['clock-status',userId],enabled:!!userId,queryFn:async()=> {
    const {data,error}=await invoke('my_clock_status',{}); if(error) throw error;
    if(userId) localStorage.setItem(`ronin.clock.status.${userId}`,JSON.stringify(data));
    return data as unknown as ClockStatus;
  }, initialData:()=> {try{return userId?JSON.parse(localStorage.getItem(`ronin.clock.status.${userId}`)||'null')||undefined:undefined;}catch{return undefined;}}, staleTime:0,refetchOnWindowFocus:true,refetchInterval:60000,refetchIntervalInBackground:false});
  const zones=useQuery({queryKey:['clock-timezones',userId],enabled:!!userId&&!!status.data?.enabled,queryFn:async()=> {
    const {data,error}=await supabase.from('properties').select('id, timezone').limit(500);if(error) throw error;
    return Object.fromEntries((data||[]).map(p=>[p.id,safeTimezone(p.timezone)]));
  }});
  const queued=userId?readQueue(userId):[];
  const queuedStart=queued.find(a=>a.rpc==='clock_in');
  const queuedEnd=queued.find(a=>a.rpc==='clock_out');
  const persisted=status.data;
  const queuedProperty=persisted?.properties?.find(p=>p.id===queuedStart?.args._property_id);
  const s=persisted&&queuedStart&&!persisted.open&&!queuedEnd?{...persisted,open:{entry_id:queuedStart.id,clock_in:String(queuedStart.args._client_time),property_id:queuedProperty?.id||'',property_name:queuedProperty?.name||'',visit_date:String(queuedStart.args._client_time).slice(0,10)}}:persisted;
  const timezone=zones.data?.[s?.open?.property_id||last?.action.propertyId||String(last?.action.args._property_id)||'']||'UTC';
  const totals=useQuery({queryKey:['clock-completed',userId,s?.now],enabled:!!userId&&!!s?.enabled&&!s.open,queryFn:async()=> {
    const now=new Date();const from=new Date(now.getTime()-86400000).toISOString().slice(0,10),to=new Date(now.getTime()+86400000).toISOString().slice(0,10);
    const {data,error}=await supabase.from('time_entries').select('property_id, visit_date, clock_in, clock_out').eq('staff_id',userId||'').gte('visit_date',from).lte('visit_date',to).not('clock_out','is',null).neq('status','not_worked').limit(100);
    if(error)throw error;
    return (data||[]).filter(e=>s?.visits.some(v=>v.property_id===e.property_id&&v.visit_date===e.visit_date)).reduce((n,e)=>n+(Date.parse(e.clock_out||'')-Date.parse(e.clock_in))/60000,0);
  }});
  const format=(at:string,zone=timezone)=>new Intl.DateTimeFormat(es?'es-US':'en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(at));
  const onResult=useCallback((action:ClockAction,data:Record<string,unknown>)=> {
    setLast({action,data});
    if(action.rpc==='clock_out'&&typeof data.entry_id==='string') {setReasonEntry(data.entry_id);setSheet('reason');}
  },[]);
  const sync=useCallback(async()=> {
    if(!userId||document.visibilityState==='hidden'||lock.current)return;
    try {await flushQueue(userId,invoke,onResult,true);await status.refetch();}catch {setMessage(language==='es'?'No se pudo enviar. Inténtalo de nuevo.':'Could not send. Please try again.');}
  },[userId,onResult,language,status.refetch]);
  useEffect(()=> {
    if(userId) {try {setLast(JSON.parse(localStorage.getItem(`ronin.clock.last.${userId}`)||'null'));}catch{/* no saved result */}}
    void sync(); const visible=()=>{if(document.visibilityState==='visible')void sync();};
    window.addEventListener('online',sync);window.addEventListener('focus',sync);document.addEventListener('visibilitychange',visible);
    const timer=setInterval(visible,60000);return()=>{clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',visible);};
  },[sync,userId]);
  useEffect(()=> {if(!sheet)return;registerBackHandler(()=>{setSheet(null);return true;});return()=>registerBackHandler(null);},[sheet,registerBackHandler]);
  const execute=async()=> {
    const p=pending.current;if(!p||!userId||lock.current)return;lock.current=true;setBusy(true);setMessage('');setSheet(null);
    let action:ClockAction|undefined;
    try {
      // Persist the tap BEFORE waiting for GPS or the network. GPS failure is never an error.
      const waiting=readQueue(userId).find(a=>a.rpc===p.rpc);
      action=waiting||{id:crypto.randomUUID(),rpc:p.rpc,args:{_lat:null,_lng:null,_accuracy_m:null,_client_time:p.at,_manual_time:p.manual,...(p.rpc==='clock_in'?{_property_id:p.property}:{_reason:null})},expectedEntry:persisted?.open?.entry_id,propertyId:p.property||s?.open?.property_id};
      enqueue(userId,action);
      const locationRequest=getLocation();
      // Ending is submitted at the tap, without an eight-second GPS wait. A cached
      // immediate location can be included; otherwise location remains unavailable.
      const location=p.rpc==='clock_out'?await Promise.race([locationRequest,Promise.resolve({_lat:null,_lng:null,_accuracy_m:null})]):await locationRequest;
      // Update the existing durable action with the optional coordinates.
      const q=readQueue(userId).map(a=>a.id===action?.id?{...a,args:{...a.args,...location}}:a);
      localStorage.setItem(`ronin.clock.queue.${userId}`,JSON.stringify(q));
      await flushQueue(userId,invoke,onResult,!!waiting);
      if(readQueue(userId).length)setMessage(text('Guardado. Se enviará cuando haya señal.','Saved. It will send when you have signal.'));
      await status.refetch();
    }catch(error) {
      if((error as {message?:string}).message?.includes('property_required')) {if(action)remove(userId,action.id);setSheet('houses');}
      else setMessage(text('No se pudo registrar. Toca para intentar de nuevo.','Could not record. Tap to try again.'));
    }finally {lock.current=false;setBusy(false);}
  };
  const begin=(rpc:'clock_in'|'clock_out',property:string|null=null,at=new Date().toISOString(),manual=false)=> {
    if(lock.current||sheet==='location')return;
    pending.current={rpc,property,at,manual};
    if(!userId)return;
    if(!localStorage.getItem(`ronin.clock.location.${userId}`))setSheet('location');else void execute();
  };
  if(!s?.enabled)return null;
  const state=clockState(s); const visits=nearestVisits(s.visits,zones.data||{},new Date());
  const lastEnd=last?.action.rpc==='clock_out'&&localParts(new Date(String(last.data.clock_out)),timezone).date===localParts(new Date(s.now),timezone).date?last:null;
  const summary=lastEnd?text(`Terminaste a las ${format(String(lastEnd.data.clock_out))}, ${duration(Number(lastEnd.data.minutes))}`,`You finished at ${format(String(lastEnd.data.clock_out))}, ${duration(Number(lastEnd.data.minutes))}`):'';
  const buttonClass='w-full min-h-[72px] h-auto whitespace-normal text-xl px-4 py-4';
  const cardButtonClass='clock-card-primary w-full h-[54px] min-h-[54px] text-lg px-4 py-2';
  const correction=state!=='done'?<Button variant="link" className="clock-card-correction min-h-10 h-10 text-sm text-muted-foreground px-0 py-0" disabled={busy} onClick={()=>{pending.current={rpc:s.open?'clock_out':'clock_in',property:s.open?.property_id||visits[0]?.property_id||s.properties[0]?.id||null,at:'',manual:true};setSheet('time');}}>{s.open?text('¿Terminaste antes?','Finished earlier?'):text('¿Olvidaste empezar?','Forgot to start?')}</Button>:null;
  const extra=()=>{pending.current=null;if(s.properties.length===1)begin('clock_in',s.properties[0].id);else setSheet('houses');};
  const saveReason=async(reason:string)=> {
    if(!userId||!reasonEntry||busy)return;setBusy(true);
    try {enqueue(userId,{id:`reason:${reasonEntry}`,rpc:'set_visit_reason',args:{_entry_id:reasonEntry,_reason:reason}});await flushQueue(userId,invoke);setSheet(null);if(readQueue(userId).length)setMessage(text('Guardado. Se enviará cuando haya señal.','Saved. It will send when you have signal.'));}
    catch{setMessage(text('No se pudo guardar. Inténtalo de nuevo.','Could not save. Please try again.'));}finally{setBusy(false);}
  };
  return <section aria-label={text('Tu visita','Your visit')} className="clock-surface clock-card px-4 py-3 border-b border-border space-y-2 text-sm">
    <div className="clock-card-content">
    {state==='open'&&s.open&&<><p className="min-w-0 truncate" role={last?.action.rpc==='clock_in'?'status':undefined}><strong>{s.open.property_name}</strong> · {text('Empezaste a las','You started at')} {format(s.open.clock_in,zones.data?.[s.open.property_id]||'UTC')}</p><Button disabled={busy} className={`${cardButtonClass} clock-end`} onClick={()=>begin('clock_out')}><Square/>{text('Terminar','End')}</Button></>}
    {state==='visits'&&visits.map(v=><div key={`${v.property_id}:${v.start_time}`} className="contents"><p className="min-w-0 truncate">{text('Hoy','Today')}: <strong>{v.property_name}</strong> · {new Intl.DateTimeFormat(es?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(`2000-01-01T${v.start_time}Z`))} {text('a','to')} {new Intl.DateTimeFormat(es?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(`2000-01-01T${v.end_time}Z`))}</p><Button className={`${cardButtonClass} clock-start`} disabled={busy} onClick={()=>begin('clock_in',v.property_id)}><Play/><span className="truncate">{text('Empezar','Start')}{visits.length>1&&` · ${v.property_name}`}</span></Button></div>)}
    {state==='done'&&<p className="flex min-w-0 items-center gap-2"><CheckCircle2 className="h-5 w-5 shrink-0"/><span className="truncate">{text('Listo por hoy','All done today')}{(lastEnd||totals.data!==undefined)&&` · ${duration(lastEnd?Number(lastEnd.data.minutes):totals.data||0)}`}</span></p>}
    {state==='extra'&&<><p className="min-w-0 truncate text-muted-foreground">{text('Hoy no tienes visita','No visit today')}</p><Button variant="secondary" className={cardButtonClass} disabled={busy||!s.properties.length} onClick={extra}><Play/>{text('Empezar una visita extra','Start an extra visit')}</Button></>}
    {correction}
    </div>
    {summary&&state!=='open'&&<p className="text-sm" role="status">{summary}</p>}
    {message&&<p className="text-sm" role="status">{message}</p>}
    <Sheet open={!!sheet} onOpenChange={open=>{if(!open)setSheet(null);}}><SheetContent side="bottom" className="h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col text-base">
      <SheetTitle className="text-2xl">{sheet==='reason'?text('¿Qué hiciste hoy?','What was today?'):sheet==='houses'?text('¿En qué casa?','Which house?'):sheet==='time'?text('¿A qué hora?','What time?'):text('Tu ubicación','Your location')}</SheetTitle>
      <SheetDescription className="sr-only">{text('Tu visita','Your visit')}</SheetDescription>
      <div className="overflow-y-auto flex-1 space-y-3">
        {sheet==='location'&&<><p>{text('Solo comprobamos tu ubicación cuando tocas Empezar y Terminar. No se registra en ningún otro momento.','We only check your location when you tap Start and End. It is not recorded at any other time.')}</p><Button className={buttonClass} onClick={()=>{if(userId)localStorage.setItem(`ronin.clock.location.${userId}`,'1');void execute();}}>{text('Entendido','Got it')}</Button></>}
        {sheet==='houses'&&s.properties.map(p=><Button key={p.id} variant="secondary" className={buttonClass} disabled={busy} onClick={()=>begin('clock_in',p.id,pending.current?.manual?pending.current.at:undefined,!!pending.current?.manual)}><Home/>{p.name}</Button>)}
        {sheet==='time'&&<><div className="flex gap-3"><label className="flex-1">{text('Hora','Hour')}<select aria-label={text('Hora','Hour')} className="w-full min-h-14 bg-background border border-input rounded-md" value={hour} onChange={e=>setHour(e.target.value)}>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h}>{h}</option>)}</select></label><label className="flex-1">{text('Minuto','Minute')}<select aria-label={text('Minuto','Minute')} className="w-full min-h-14 bg-background border border-input rounded-md" value={minute} onChange={e=>setMinute(e.target.value)}>{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(m=><option key={m}>{m}</option>)}</select></label></div><Button className={buttonClass} onClick={()=> {
          const p=pending.current;if(!p)return;const at=manualTime(hour,minute,zones.data?.[p.property||'']||'UTC',new Date(),s.open?.clock_in);
          if(!at){setMessage(text('Elige una hora de hoy, después de empezar y antes de ahora.','Choose a time today, after starting and before now.'));return;}
          p.at=at;if(p.rpc==='clock_in'&&s.properties.length>1&&!visits.length)setSheet('houses');else begin(p.rpc,p.property,at,true);
        }}>{text('Guardar hora','Save time')}</Button>{message&&<p role="status">{message}</p>}</>}
        {sheet==='reason'&&reasons.map(([code,spanish,english])=><Button key={code} variant="secondary" disabled={busy} className={buttonClass} onClick={()=>void saveReason(code)}>{es?spanish:english}</Button>)}
      </div>
      {sheet==='reason'&&<Button variant="link" className="min-h-14 text-base shrink-0" onClick={()=>setSheet(null)}>{text('Omitir','Skip')}</Button>}
    </SheetContent></Sheet>
  </section>;
}
