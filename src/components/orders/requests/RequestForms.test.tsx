import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({insert:vi.fn(),update:vi.fn(),single:vi.fn(),saved:vi.fn(),close:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({insert:mock.insert,update:mock.update})}}));
import { RequestEditSheet, RequestScreen } from './RequestForms';
beforeEach(()=>{vi.clearAllMocks();const q={eq:()=>q,select:()=>q,single:mock.single};mock.insert.mockReturnValue(q);mock.update.mockReturnValue(q);mock.single.mockResolvedValue({data:{id:'saved'},error:null});});
describe('request forms',()=>{
  it('sends named request with quantity, house and author',async()=>{
    render(<RequestScreen houseId="a" userId="me" es={false} onSent={mock.saved}/>);
    expect((screen.getByRole('button',{name:'Send request'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('What is it? (optional)'),{target:{value:'Towels'}});
    fireEvent.click(screen.getByLabelText('Increase quantity'));fireEvent.click(screen.getByRole('button',{name:'Send request'}));
    await waitFor(()=>expect(mock.saved).toHaveBeenCalled());expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({name:'Towels',quantity:'2',property_id:'a',created_by:'me'}));
  });
  it('failed request keeps text and permits retry',async()=>{mock.single.mockResolvedValueOnce({data:null,error:{message:'offline'}});render(<RequestScreen houseId="a" userId="me" es={false} onSent={mock.saved}/>);fireEvent.change(screen.getByLabelText('What is it? (optional)'),{target:{value:'Towels'}});fireEvent.click(screen.getByRole('button',{name:'Send request'}));await screen.findByRole('alert');expect((screen.getByLabelText('What is it? (optional)') as HTMLInputElement).value).toBe('Towels');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await waitFor(()=>expect(mock.saved).toHaveBeenCalled());});
  it('library sheet begins at default and saves chosen units',async()=>{render(<RequestEditSheet item={{id:'i',name:'Soap',category:'cleaning',image_url:null,size:null,default_quantity:'3'}} houseId="a" userId="me" es={true} onSaved={mock.saved} onClose={mock.close}/>);fireEvent.click(screen.getByLabelText('Más'));fireEvent.click(screen.getByRole('button',{name:'Añadir a mi lista'}));await waitFor(()=>expect(mock.saved).toHaveBeenCalled());expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({quantity:'4',library_item_id:'i',category:'cleaning'}));});
});
