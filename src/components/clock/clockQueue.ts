export type ClockAction = { id: string; rpc: 'clock_in'|'clock_out'|'set_visit_reason'; args: Record<string, string|number|boolean|null>; expectedEntry?: string; propertyId?: string; };
export type RpcResult = { data: Record<string,unknown>|null; error: { message: string; code?: string }|null };
const key = (user: string) => `ronin.clock.queue.${user}`;
export const readQueue = (user: string): ClockAction[] => JSON.parse(localStorage.getItem(key(user)) || '[]');
export function enqueue(user: string, action: ClockAction) { const q=readQueue(user); if (!q.some(a=>a.id===action.id)) localStorage.setItem(key(user),JSON.stringify([...q,action])); }
export function isNetworkError(error: {message:string;code?:string}) { return !navigator.onLine || /fetch|network|connection|offline|timeout|load failed/i.test(error.message); }
const locks = new Map<string,Promise<void>>();
export async function flushQueue(user: string, invoke: (rpc:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>, onResult?: (a:ClockAction,data:Record<string,unknown>)=>void, retry=false) {
  const existing=locks.get(user); if(existing) { await existing; return; }
  const work=(async()=> {
    let startedEntry: string | undefined;
    for (const action of readQueue(user)) {
      if (!navigator.onLine) break;
      try {
        // A repeated End must never close a subsequent visit after an ambiguous response.
        if (action.rpc==='clock_out' && startedEntry) action.expectedEntry=startedEntry;
        if (retry && action.rpc==='clock_out' && action.expectedEntry) {
          const status=await invoke('my_clock_status',{}); if(status.error) throw status.error;
          const open=status.data?.open as {entry_id?:string}|null;
          if (!open || open.entry_id!==action.expectedEntry) { remove(user,action.id); continue; }
        }
        const {data,error}=await invoke(action.rpc,action.args);
        if(error) { if(error.message.includes('no_open_visit')) {remove(user,action.id);continue;} throw error; }
        if(action.rpc==='clock_in'&&typeof data?.entry_id==='string')startedEntry=data.entry_id;
        if (data && action.rpc!=='set_visit_reason') { localStorage.setItem(`ronin.clock.last.${user}`, JSON.stringify({action,data})); onResult?.(action,data); }
        remove(user,action.id);
      } catch(error) {
        const e=error as {message:string};
        if(isNetworkError(e)) break;
        // Keep rejected work durable but stop: no following action may overtake it.
        throw e;
      }
    }
  })(); locks.set(user,work); try {await work;} finally {locks.delete(user);}
}
export function remove(user:string,id:string) {localStorage.setItem(key(user),JSON.stringify(readQueue(user).filter(a=>a.id!==id)));}
export function getLocation(): Promise<{_lat:number|null;_lng:number|null;_accuracy_m:number|null}> { return new Promise(resolve=> {
  const empty={_lat:null,_lng:null,_accuracy_m:null};
  if(!navigator.geolocation) return resolve(empty);
  navigator.geolocation.getCurrentPosition(p=>resolve({_lat:p.coords.latitude,_lng:p.coords.longitude,_accuracy_m:p.coords.accuracy}),()=>resolve(empty),{enableHighAccuracy:true,timeout:8000,maximumAge:60000});
}); }
