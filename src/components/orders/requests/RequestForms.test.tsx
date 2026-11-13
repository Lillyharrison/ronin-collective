import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({insert:vi.fn(),update:vi.fn(),single:vi.fn(),saved:vi.fn(),close:vi.fn(),rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc,from:()=>({insert:mock.insert,update:mock.update})}}));
import { RequestEditSheet, RequestScreen } from './RequestForms';
beforeEach(()=>{vi.clearAllMocks();const q={eq:()=>q,select:()=>q,single:mock.single};mock.insert.mockReturnValue(q);mock.update.mockReturnValue(q);mock.single.mockResolvedValue({data:{id:'saved'},error:null});mock.rpc.mockResolvedValue({data:{sent:1},error:null});});
describe('request forms',()=>{
  it('urgent send only sends the inserted draft and retries without another insert',async()=>{render(<RequestScreen houseId="a" userId="me" es={false} onSent={mock.saved}/>);fireEvent.change(screen.getByLabelText('What is it? (optional)'),{target:{value:'Urgent soap'}});fireEvent.click(screen.getByRole('switch'));mock.rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}});fireEvent.click(screen.getByRole('button',{name:'Send now'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await waitFor(()=>expect(mock.saved).toHaveBeenCalledWith(true));expect(mock.insert).toHaveBeenCalledTimes(1);expect(mock.insert.mock.calls[0][0]).not.toHaveProperty('status');expect(mock.rpc).toHaveBeenCalledWith('send_request_list',{_property_id:'a',_ids:['saved']});});
  it('Spanish urgent action',()=>{render(<RequestScreen houseId="a" userId="me" es onSent={mock.saved}/>);expect(screen.getByRole('button',{name:'Añadir a mi lista'})).toBeDisabled();fireEvent.click(screen.getByRole('switch'));expect(screen.getByRole('button',{name:'Enviar ya'})).toBeDisabled();});

  it('sends named request with quantity, house and author',async()=>{
    render(<RequestScreen houseId="a" userId="me" es={false} onSent={mock.saved}/>);
    expect((screen.getByRole('button',{name:'Add to my list'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('What is it? (optional)'),{target:{value:'Towels'}});
    fireEvent.click(screen.getByLabelText('Increase quantity'));fireEvent.click(screen.getByRole('button',{name:'Add to my list'}));
    await waitFor(()=>expect(mock.saved).toHaveBeenCalledWith(false));expect(mock.rpc).not.toHaveBeenCalled();expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({name:'Towels',quantity:'2',property_id:'a',created_by:'me'}));
  });
  it('failed request keeps text and permits retry',async()=>{mock.single.mockResolvedValueOnce({data:null,error:{message:'offline'}});render(<RequestScreen houseId="a" userId="me" es={false} onSent={mock.saved}/>);fireEvent.change(screen.getByLabelText('What is it? (optional)'),{target:{value:'Towels'}});fireEvent.click(screen.getByRole('button',{name:'Add to my list'}));await screen.findByRole('alert');expect((screen.getByLabelText('What is it? (optional)') as HTMLInputElement).value).toBe('Towels');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await waitFor(()=>expect(mock.saved).toHaveBeenCalled());});
  it('library sheet begins at default and saves chosen units',async()=>{render(<RequestEditSheet item={{id:'i',name:'Soap',category:'cleaning',image_url:null,size:null,default_quantity:'3'}} houseId="a" userId="me" es={true} onSaved={mock.saved} onClose={mock.close}/>);fireEvent.click(screen.getByLabelText('Más'));fireEvent.click(screen.getByRole('button',{name:'Añadir a mi lista'}));await waitFor(()=>expect(mock.saved).toHaveBeenCalled());expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({quantity:'4',library_item_id:'i',category:'cleaning'}));});
});
