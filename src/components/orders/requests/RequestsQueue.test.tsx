import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),created:vi.fn(),refresh:vi.fn(),search:''}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({language:'en'})}));
vi.mock('@/hooks/useScopedProperties',()=>({useScopedProperties:()=>({properties:[{id:'h',name:'Rockingham'},{id:'h2',name:'Moreno'}]})}));
vi.mock('./RequesterOrders',()=>({RequestThumbnail:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('./useHouseRequests',()=>({useHouseRequests:()=>({rows:[{id:'1',property_id:'h',name:'Soap',status:'requested',batch_id:'b1',created_by:'me',sent_at:'2026-11-13T10:00:00Z',urgent:false,quantity:'1',created_at:'2026-11-13T10:00:00Z'},{id:'2',property_id:'h',name:'Towels',status:'requested',batch_id:'b2',created_by:'me',sent_at:'2026-11-13T11:00:00Z',urgent:true,quantity:'2',created_at:'2026-11-13T11:00:00Z'},{id:'3',property_id:'h2',name:'Milk',status:'requested',urgent:false,quantity:'1',created_at:'2026-11-13T11:00:00Z'}],names:new Map(),counts:{requested:3},refresh:mocks.refresh})}));
vi.mock('react-router-dom',()=>({useLocation:()=>({search:mocks.search})}));
import { RequestsQueue } from './RequestsQueue';
beforeEach(()=>{vi.clearAllMocks();mocks.search='';mocks.rpc.mockResolvedValue({data:'new-order',error:null});});
describe('PA queue',()=>{
 it('notification batch opens and scrolls to its matching list',()=>{mocks.search='?view=requests&batch=b2';const scroll=vi.fn();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{value:scroll,configurable:true});render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);expect(scroll).toHaveBeenCalledWith({behavior:'smooth',block:'center'});delete (HTMLElement.prototype as {scrollIntoView?:unknown}).scrollIntoView;});
 it('select all in a list selects only that batch',()=>{render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);fireEvent.click(screen.getAllByRole('button',{name:'Select all in this list'})[0]);expect(screen.getByLabelText('Select Towels').getAttribute('data-state')).toBe('checked');expect(screen.getByLabelText('Select Soap').getAttribute('data-state')).toBe('unchecked');expect(screen.getByRole('button',{name:'Create order (1)'})).toBeTruthy();});

 it('select all and create uses one house ids and optional plain date',async()=>{render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);fireEvent.click(screen.getAllByRole('button',{name:'Select all for this house'})[0]);fireEvent.click(screen.getByRole('button',{name:'Create order (2)'}));fireEvent.change(screen.getByLabelText('Expected delivery date (optional)'),{target:{value:'2026-11-15'}});fireEvent.click(screen.getByRole('button',{name:'Create order'}));await waitFor(()=>expect(mocks.created).toHaveBeenCalledWith('new-order'));expect(mocks.rpc).toHaveBeenCalledWith('create_order_from_requests',{_ids:['2','1'],_expected_delivery:'2026-11-15',_title:null});});
 it('selecting a second house replaces selection rather than mixing it',()=>{render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);fireEvent.click(screen.getByLabelText('Select Soap'));fireEvent.click(screen.getByLabelText('Select Milk'));expect(screen.getByLabelText('Select Soap').getAttribute('data-state')).toBe('unchecked');expect(screen.getByRole('button',{name:'Create order (1)'})).toBeTruthy();});
});
