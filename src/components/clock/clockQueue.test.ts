import {beforeEach,it,expect,vi} from 'vitest';
import {enqueue,readQueue,flushQueue,type ClockAction} from './clockQueue';
const action:ClockAction={id:'tap',rpc:'clock_in',args:{_client_time:'2026-11-08T08:07Z'}};
beforeEach(()=>{localStorage.clear();Object.defineProperty(navigator,'onLine',{value:true,configurable:true});});
it('queues offline tap once and retains its time',async()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});enqueue('u',action);enqueue('u',action);const invoke=vi.fn();await flushQueue('u',invoke);expect(invoke).not.toHaveBeenCalled();expect(readQueue('u')).toEqual([action]);});
it('retries and drops already_open safely',async()=>{enqueue('u',action);const invoke=vi.fn().mockResolvedValue({data:{already_open:true},error:null});await flushQueue('u',invoke);await flushQueue('u',invoke);expect(invoke).toHaveBeenCalledTimes(1);expect(readQueue('u')).toEqual([]);});
it('keeps failed network work durable',async()=>{enqueue('u',action);await flushQueue('u',vi.fn().mockResolvedValue({data:null,error:{message:'Failed to fetch'}}));expect(readQueue('u')).toHaveLength(1);});
it('records end before saving its reason',async()=>{enqueue('u',{id:'end',rpc:'clock_out',args:{_client_time:'2026-11-08T16:20Z'}});enqueue('u',{id:'reason',rpc:'set_visit_reason',args:{_entry_id:'e',_reason:'weekly_visit'}});const invoke=vi.fn().mockResolvedValue({data:{entry_id:'e'},error:null});await flushQueue('u',invoke);expect(invoke.mock.calls.map(c=>c[0])).toEqual(['clock_out','set_visit_reason']);});
it('drops no_open_visit',async()=>{enqueue('u',{...action,rpc:'clock_out'});await flushQueue('u',vi.fn().mockResolvedValue({data:null,error:{message:'no_open_visit'}}));expect(readQueue('u')).toHaveLength(0);});
it('does not close a different entry on replay',async()=>{enqueue('u',{...action,rpc:'clock_out',expectedEntry:'old'});const invoke=vi.fn().mockResolvedValue({data:{open:{entry_id:'new'}},error:null});await flushQueue('u',invoke,undefined,true);expect(invoke).toHaveBeenCalledTimes(1);expect(invoke.mock.calls[0][0]).toBe('my_clock_status');expect(readQueue('u')).toHaveLength(0);});
it('serializes concurrent retries',async()=>{enqueue('u',action);const invoke=vi.fn().mockResolvedValue({data:{entry_id:'e'},error:null});await Promise.all([flushQueue('u',invoke),flushQueue('u',invoke)]);expect(invoke).toHaveBeenCalledTimes(1);});
it('keeps queues isolated per user',()=>{enqueue('u',action);expect(readQueue('other')).toEqual([]);});
it('replays an offline start and end against the returned entry',async()=>{
  enqueue('u',action);enqueue('u',{id:'end',rpc:'clock_out',args:{_client_time:'2026-11-08T16:20Z'}});
  const invoke=vi.fn(async(name:string)=>({data:name==='clock_in'?{entry_id:'e'}:name==='my_clock_status'?{open:{entry_id:'e'}}:{entry_id:'e',minutes:495},error:null}));
  await flushQueue('u',invoke,undefined,true);
  expect(invoke.mock.calls.map(c=>c[0])).toEqual(['clock_in','my_clock_status','clock_out']);expect(readQueue('u')).toEqual([]);
});
