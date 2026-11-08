import {describe,it,expect} from 'vitest';
import {clockState,manualTime,nearestVisits,duration,type ClockStatus} from './clockLogic';
const base:ClockStatus={enabled:true,open:null,visits:[],properties:[],now:'2026-11-08T12:00Z'};
const visit={property_id:'house',property_name:'Park',visit_date:'2026-11-08',start_time:'08:00:00',end_time:'16:00:00',done:false};
describe('clock states',()=>{
 it('renders nothing if disabled',()=>expect(clockState({...base,enabled:false})).toBe('hidden'));
 it('offers rostered visits',()=>expect(clockState({...base,visits:[visit]})).toBe('visits'));
 it('shows End while open',()=>expect(clockState({...base,open:{entry_id:'e',clock_in:base.now,property_id:'h',property_name:'H',visit_date:'2026-11-08'}})).toBe('open'));
 it('shows done when every visit is done',()=>expect(clockState({...base,visits:[{...visit,done:true}]})).toBe('done'));
 it('offers extra visit without a roster',()=>expect(clockState(base)).toBe('extra'));
 it('keeps nearest visit first',()=>expect(nearestVisits([visit,{...visit,property_id:'second',start_time:'12:00:00'}],{},new Date(base.now))[0].property_id).toBe('second'));
 it('formats worked minutes',()=>expect(duration(495)).toBe('8 h 15 min'));
 it('rejects future corrections',()=>expect(manualTime('13','00','UTC',new Date(base.now))).toBeNull());
 it('rejects End before Start',()=>expect(manualTime('08','00','UTC',new Date(base.now),'2026-11-08T09:00Z')).toBeNull());
 it('uses property time rather than phone timezone',()=>expect(manualTime('06','30','America/New_York',new Date(base.now))).toBe('2026-11-08T11:30:00.000Z'));
});
