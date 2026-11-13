import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),created:vi.fn(),refresh:vi.fn()}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({language:'en'})}));
vi.mock('@/hooks/useScopedProperties',()=>({useScopedProperties:()=>({properties:[{id:'h',name:'Rockingham'},{id:'h2',name:'Moreno'}]})}));
vi.mock('./RequesterOrders',()=>({RequestThumbnail:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('./useHouseRequests',()=>({useHouseRequests:()=>({rows:[{id:'1',property_id:'h',name:'Soap',status:'requested',urgent:false,quantity:'1',created_at:'2026-11-13T10:00:00Z'},{id:'2',property_id:'h',name:'Towels',status:'requested',urgent:true,quantity:'2',created_at:'2026-11-13T11:00:00Z'},{id:'3',property_id:'h2',name:'Milk',status:'requested',urgent:false,quantity:'1',created_at:'2026-11-13T11:00:00Z'}],names:new Map(),counts:{requested:3},refresh:mocks.refresh})}));
import { RequestsQueue } from './RequestsQueue';
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:'new-order',error:null});});
describe('PA queue',()=>{
 it('select all and create uses one house ids and optional plain date',async()=>{render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);fireEvent.click(screen.getAllByRole('button',{name:'Select all for this house'})[0]);fireEvent.click(screen.getByRole('button',{name:'Create order (2)'}));fireEvent.change(screen.getByLabelText('Expected delivery date (optional)'),{target:{value:'2026-11-15'}});fireEvent.click(screen.getByRole('button',{name:'Create order'}));await waitFor(()=>expect(mocks.created).toHaveBeenCalledWith('new-order'));expect(mocks.rpc).toHaveBeenCalledWith('create_order_from_requests',{_ids:['2','1'],_expected_delivery:'2026-11-15',_title:null});});
 it('selecting a second house replaces selection rather than mixing it',()=>{render(<RequestsQueue onCreated={mocks.created} onRequest={()=>{}}/>);fireEvent.click(screen.getByLabelText('Select Soap'));fireEvent.click(screen.getByLabelText('Select Milk'));expect(screen.getByLabelText('Select Soap').getAttribute('data-state')).toBe('unchecked');expect(screen.getByRole('button',{name:'Create order (1)'})).toBeTruthy();});
});
