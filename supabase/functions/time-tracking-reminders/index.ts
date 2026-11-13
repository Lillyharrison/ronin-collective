import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { endDue, keys, localNow, monthWords, previousMonth, startWindow, timeMinutes, visitWords } from './logic.ts';
import { clockEligiblePeople } from './eligibility.ts';
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=> {
  if(req.method==='OPTIONS')return response({ok:true});
  if(req.method!=='POST')return response({error:'POST required'},405);
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!service)return response({error:'Missing configuration'},500);
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:config,error:configError}=await db.from('private_config').select('value').eq('key','time_tracking_cron_token').maybeSingle();
  if(configError)return response({error:'Could not verify cron authentication'},500);
  if(!config)return response({error:'Cron authentication is not configured'},503);
  if(!config.value || req.headers.get('Authorization')!==`Bearer ${config.value}`)return response({error:'Unauthorized'},401);
  const parsed=z.object({mode:z.enum(['visits','month'])}).strict().safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return response({error:'Expected mode visits or month'},400);
  const now=new Date(); let sent=0;
  const check=<T,>(r:{data:T;error:unknown})=>{if(r.error)throw r.error;return r.data;};
  async function pages(table:string,columns:string,filter:(q:any)=>any) {const all:any[]=[];for(let from=0;;from+=500){const rows=check(await filter(db.from(table).select(columns)).range(from,from+499)) as any[];all.push(...rows);if(rows.length<500)break;}return all;}
  async function send(key:string,staff:string,kind:string,recipient:string,words:{title:string;body:string},entityType:string,entityId:string|null,property:string|null=null) {
    const claimed=check(await db.from('time_reminders_sent').upsert({dedupe_key:key,staff_id:staff,kind},{onConflict:'dedupe_key',ignoreDuplicates:true}).select('id'));
    if(!claimed?.length)return;
    const action=entityType==='clock_reminder'?'home':'staff-schedule';
    const {error}=await db.from('notifications').insert({user_id:recipient,...words,type:'info',entity_type:entityType,entity_id:entityId,property_id:property,action_url:action});
    if(error){await db.from('time_reminders_sent').delete().eq('dedupe_key',key);throw error;}
    sent++;
    try {const pushed=await fetch(`${url}/functions/v1/send-push-notification`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${service}`},body:JSON.stringify({recipientUserIds:[recipient],...words,url:entityType==='clock_reminder'?'/?clock=1':'/staff-schedule'})});if(!pushed.ok)console.error('Time reminder push was not accepted');}catch{console.error('Time reminder push unavailable');}
  }
  try {
    const settings=await pages('staff_time_settings','staff_id',q=>q.eq('time_tracking','ronin'));
    const ids=settings.map(s=>s.staff_id); const loginIds=check(await db.rpc('ids_with_login',{_ids:ids})) as string[];
    const candidates=loginIds.length?await pages('profiles','id, full_name, language_pref',q=>q.in('id',loginIds).eq('is_archived',false)):[];
    const profiles=await clockEligiblePeople(candidates,id=>db.rpc('can_clock_in',{_uid:id}));
    if(parsed.data.mode==='visits') {
      const properties=await pages('properties','id, name, timezone',q=>q); const props=new Map(properties.map(p=>[p.id,p]));
      const from=new Date(now.getTime()-86400000).toISOString().slice(0,10),to=new Date(now.getTime()+86400000).toISOString().slice(0,10);
      for(const person of profiles) {
        const visits=check(await db.rpc('effective_visits',{_staff:person.id,_from:from,_to:to})) as any[];
        const entries=await pages('time_entries','id, property_id, visit_date, clock_in, clock_out, scheduled_start, scheduled_end, status',q=>q.eq('staff_id',person.id).or(`clock_out.is.null,and(visit_date.gte.${from},visit_date.lte.${to})`));
        const open=entries.find(e=>!e.clock_out);
        for(const visit of visits) {
          const property=props.get(visit.property_id);if(!property||!visit.start_time)continue;
          const local=localNow(now,property.timezone);if(visit.visit_date!==local.date)continue;
          const complete=entries.some(e=>e.property_id===visit.property_id&&e.visit_date===visit.visit_date&&e.clock_out&&e.status!=='not_worked');
          if(!open&&!complete&&startWindow(local.minutes,timeMinutes(visit.start_time)))await send(keys.start(person.id,visit.visit_date,property.id),person.id,'start',person.id,visitWords('start',person.language_pref==='es',property.name,visit.start_time),'clock_reminder',null,property.id);
        }
        if(open?.scheduled_end) {const property=props.get(open.property_id);if(property&&endDue(now,property.timezone,open.visit_date,open.scheduled_end,open.scheduled_start))await send(keys.end(open.id),person.id,'end',person.id,visitWords('end',person.language_pref==='es',property.name,open.scheduled_end),'clock_reminder',null,property.id);}
      }
    } else {
      const period=previousMonth(now);const overview=check(await db.rpc('timesheet_overview',{_period_start:period})) as any[];
      const roles=await pages('user_roles','user_id',q=>q.in('role',['master_admin','admin']));
      const adminIds=check(await db.rpc('ids_with_login',{_ids:[...new Set(roles.map(r=>r.user_id))]})) as string[];
      const admins=adminIds.length?await pages('profiles','id, language_pref',q=>q.in('id',adminIds).eq('is_archived',false)):[];
      const staff=new Set(profiles.map(p=>p.id));
      for(const row of overview) {
        if(!staff.has(row.staff_id)||!row.visits||['issued','paid'].includes(row.timesheet_status))continue;
        for(const admin of admins) {
          const attention=row.attention_count||0;
          await send(keys.month(false,row.staff_id,period,admin.id),row.staff_id,'month_ready',admin.id,monthWords(admin.language_pref==='es',false,row.full_name||'',period,Number(row.total_hours),attention),'timesheet',row.staff_id);
          if(now.getUTCDate()>=4)await send(keys.month(true,row.staff_id,period,admin.id),row.staff_id,'month_nudge',admin.id,monthWords(admin.language_pref==='es',true,row.full_name||'',period,Number(row.total_hours),attention),'timesheet',row.staff_id);
        }
      }
    }
    return response({mode:parsed.data.mode,sent});
  }catch{console.error('Time tracking reminder processing failed');return response({error:'Could not process reminders'},500);}
});
