import { describe, expect, it, vi } from 'vitest';
import { addedQuantity, byBatch, arrivalGroups, ownDrafts, sendListArgs, byOrder, canChangeRequest, compressedDimensions, compressRequestPhoto, createOrderArgs, defaultQuantity, managementView, orderNotificationPath, requestCounts, requestPayload, requestPhotoPath, toggleQueueSelection, urgentFirst, validRequest, type HouseRequest } from './logic';
const row=(id:string, house='a', extra:Partial<HouseRequest>={}):HouseRequest=>({id,property_id:house,name:'Soap',category:'other',quantity:'2',notes:null,created_by:'me',library_item_id:'soap',photo_url:null,urgent:false,status:'requested',order_id:null,created_at:'2026-11-13T10:00:00Z',ordered_at:null,received_at:null,received_by:null,...extra});
describe('house requests',()=>{
  it('inserts omit status so the database creates private drafts',()=>expect(requestPayload({houseId:'a',userId:'me',name:'Soap',quantity:1,notes:''})).not.toHaveProperty('status'));
  it('own draft list ignores colleagues and other houses',()=>expect(ownDrafts([row('1','a',{status:'draft'}),row('2','a',{status:'draft',created_by:'other'}),row('3','b',{status:'draft'}),row('4')],'a','me').map(r=>r.id)).toEqual(['1']));
  it('counts own drafts and all sent not-arrived lines',()=>expect(requestCounts([row('1','a',{status:'draft'}),row('2','a',{status:'draft',created_by:'other'}),row('3'),row('4','a',{status:'ordered'})],'a','me')).toEqual({draft:1,requested:1,ordered:1,way:2}));
  it('list send omits ids; urgent send selects only one id',()=>{expect(sendListArgs('a')).toEqual({_property_id:'a'});expect(sendListArgs('a',['1'])).toEqual({_property_id:'a',_ids:['1']});});
  it('PA groups by batch, urgent lists first',()=>{const rows=[row('1','a',{batch_id:'b'}),row('2','a',{batch_id:'b'}),row('3','a',{batch_id:'urgent',urgent:true})];expect(byBatch(rows).map(([id,lines])=>[id,lines.length])).toEqual([['urgent',1],['b',2]]);});
  it('arrivals include requested batches and ordered groups only',()=>expect(arrivalGroups([row('1','a',{batch_id:'b'}),row('2','a',{status:'ordered',order_id:'o'}),row('3','a',{status:'draft'})]).map(g=>[g.id,g.sent])).toEqual([['batch:b',true],['o',false]]));

  it('counts requested and ordered only at selected house',()=>expect(requestCounts([row('1'),row('2','b'),row('3','a',{status:'ordered'}),row('4','a',{status:'received'})] ,'a','me')).toEqual({draft:0,requested:1,ordered:1,way:2}));
  it.each(['staff','principal',null])('requester tiles for %s',role=>expect(managementView(role)).toBe(false));
  it.each(['manager','admin','master_admin'])('management view for %s',role=>expect(managementView(role)).toBe(true));
  it('requires text or a photo',()=>{expect(validRequest(' ',null)).toBe(false);expect(validRequest('Soap',null)).toBe(true);expect(validRequest('',{})).toBe(true);});
  it('photo-only insert binds house and author, with text quantity and other category',()=>expect(requestPayload({houseId:'a',userId:'me',name:'',quantity:3,notes:' please ',photoUrl:'https://photo',urgent:true})).toEqual({property_id:'a',created_by:'me',name:'Photo request',quantity:'3',notes:'please',photo_url:'https://photo',urgent:true,category:'other',library_item_id:null}));
  it('rejects inserts without a house',()=>expect(()=>requestPayload({houseId:'',userId:'me',name:'Soap',quantity:1,notes:''})).toThrow());
  it('uses unguessable UUID paths in order-requests folder',()=>{expect(requestPhotoPath()).toMatch(/^order-requests\/[0-9a-f-]{36}\.jpg$/);expect(requestPhotoPath()).not.toEqual(requestPhotoPath());});
  it('library inserts retain item identity and category',()=>{expect(requestPayload({houseId:'a',userId:'me',name:'Soap',quantity:2,notes:'',libraryItem:{id:'soap',name:'Soap',category:'cleaning',size:null,image_url:null,default_quantity:'2'}})).toMatchObject({library_item_id:'soap',category:'cleaning',quantity:'2'});});
  it('plain numeric default only',()=>{expect(defaultQuantity('4')).toBe(4);expect(defaultQuantity('2 packs')).toBe(1);expect(defaultQuantity(null)).toBe(1);});
  it('added pill totals only requested units for the same house and item',()=>expect(addedQuantity([row('1','a',{status:'draft'}),row('2','a',{status:'draft'}),row('3','b'),row('4','a',{status:'ordered'})],'a','soap','me')).toBe(4));
  it('colleague rows are retained but not removable by another person',()=>{const r=row('1','a',{created_by:'colleague'});expect(requestCounts([r],'a','me').requested).toBe(1);expect(canChangeRequest(r,'me')).toBe(false);expect(canChangeRequest(row('2'),'me')).toBe(true);expect(canChangeRequest(row('3','a',{status:'ordered'}),'me')).toBe(false);});
  it('groups ordered requests by order, excluding received',()=>expect(byOrder([row('1','a',{status:'ordered',order_id:'o'}),row('2','a',{status:'ordered',order_id:'o'}),row('3','a',{status:'received',order_id:'o'})])[0][1].map(r=>r.id)).toEqual(['1','2']));
  it('urgent first without mutating input',()=>{const r=[row('1'),row('2','a',{urgent:true})];expect(urgentFirst(r).map(x=>x.id)).toEqual(['2','1']);expect(r[0].id).toBe('1');});
  it('queue cannot mix houses',()=>expect(toggleQueueSelection(['1'],row('2','b'),[row('1'),row('2','b')])).toEqual(['2']));
  it('create-order arguments contain selected ids, plain delivery date and null title',()=>expect(createOrderArgs(['1'],[row('1')],'2026-11-15')).toEqual({_ids:['1'],_expected_delivery:'2026-11-15',_title:null}));
  it('rejects mixed house order creation',()=>expect(()=>createOrderArgs(['1','2'],[row('1'),row('2','b')],'')).toThrow());
  it('notification routes queue, requester arrivals, and manager order detail',()=>{expect(orderNotificationPath('order_request','r',true)).toBe('/orders?view=requests&batch=r');expect(orderNotificationPath('order','o',false)).toBe('/orders?order=o&view=way');expect(orderNotificationPath('order','o',true)).toBe('/orders?order=o');});
  it('caps phone dimensions at 1600 without upscaling',()=>{expect(compressedDimensions(4032,3024)).toEqual({width:1600,height:1200});expect(compressedDimensions(1200,2400)).toEqual({width:800,height:1600});expect(compressedDimensions(200,100)).toEqual({width:200,height:100});});
  it('produces JPEG at 0.8 and closes bitmap',async()=>{
    const close=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:4032,height:3024,close}));
    const drawImage=vi.fn();const blob=new Blob(['jpeg'],{type:'image/jpeg'});
    const canvas={width:0,height:0,getContext:()=>({drawImage}),toBlob:vi.fn((cb:(v:Blob)=>void)=>cb(blob))};
    const spy=vi.spyOn(document,'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);
    expect(await compressRequestPhoto(new File(['x'],'phone.jpg'))).toBe(blob);
    expect(canvas.width).toBe(1600);expect(canvas.height).toBe(1200);expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function),'image/jpeg',0.8);expect(close).toHaveBeenCalled();spy.mockRestore();vi.unstubAllGlobals();
  });
});
