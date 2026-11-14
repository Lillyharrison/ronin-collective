import { itemCount, photoRequestName } from "@/lib/spanishDisplay";
import { useContentTranslation, TranslationNotice } from "@/components/ContentTranslation";
import './requests.css';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useScopedProperties } from '@/hooks/useScopedProperties';
import { toast } from 'sonner';
import { byBatch, createOrderArgs, toggleQueueSelection, urgentFirst, type HouseRequest } from './logic';
import { RequestThumbnail } from './RequesterOrders';
import { useHouseRequests } from './useHouseRequests';
export function RequestsQueue({ onCreated, onRequest }: {onCreated:(id:string)=>void;onRequest:()=>void}) {
  const {language}=useLanguage(); const es=language==='es';const {properties}=useScopedProperties();
  const data=useHouseRequests(null,true);const [selected,setSelected]=useState<string[]>([]);
  const [confirm,setConfirm]=useState(false);const [delivery,setDelivery]=useState('');const [busy,setBusy]=useState(false);
  const [photo,setPhoto]=useState<string|null>(null);const [cancel,setCancel]=useState<HouseRequest|null>(null);
  const location=useLocation(); const batch=new URLSearchParams(location.search).get('batch'); const [highlight,setHighlight]=useState<string|null>(null);
  const content=useContentTranslation(data.rows.flatMap(r=>[r.name === "Photo request" ? "" : r.name,r.notes??""]));
  const text=(s:string|null|undefined)=>content.text(photoRequestName(s??"",es));
  const rows=urgentFirst(data.rows);const validSelected=selected.filter(id=>rows.some(r=>r.id===id));
  useEffect(()=>{if(!batch||!rows.some(r=>r.batch_id===batch))return;const el=document.getElementById(`request-batch-${batch}`);el?.scrollIntoView?.({behavior:'smooth',block:'center'});setHighlight(batch);const timer=setTimeout(()=>setHighlight(null),3500);return()=>clearTimeout(timer);},[batch,data.rows]);
  const groups=[...new Set(rows.map(r=>r.property_id))];
  const create=async()=>{if(busy)return;setBusy(true);try{
    const args=createOrderArgs(validSelected,rows,delivery);const{data:id,error}=await supabase.rpc('create_order_from_requests',args);
    if(error||!id)throw error;await data.refresh();setConfirm(false);setSelected([]);onCreated(id);
  }catch{toast.error(es?'No se pudo crear el pedido. Vuelve a intentarlo.':'Could not create the order. Please try again.');}finally{setBusy(false);}};
  const remove=async()=>{if(!cancel||busy)return;setBusy(true);try{const{data:row,error}=await supabase.from('shopping_list_items').update({status:'cancelled'}).eq('id',cancel.id).eq('status','requested').select('id').single();if(error||!row)throw error;await data.refresh();setCancel(null);}catch{toast.error(es?'No se pudo quitar.':'Could not remove.');}finally{setBusy(false);}};
  return <div className="px-4 py-4 pb-32 max-w-3xl mx-auto min-w-0 text-base">
    <div className="flex items-center justify-between gap-3 mb-5"><h2 className="font-display text-2xl">{es?'Solicitudes':'Requests'} ({data.counts.requested})</h2><Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={onRequest}>{es?'Pedir algo':'Request something'}</Button></div>
    <TranslationNotice value={content}/>
    {data.isLoading&&<p>{es?'Cargando…':'Loading…'}</p>}{data.isError&&<><p role="alert">{es?'No se pudieron cargar las solicitudes.':'Could not load requests.'}</p><Button onClick={()=>{void data.refetch();}}>{es?'Reintentar':'Retry'}</Button></>}
    {!data.isLoading&&!data.isError&&!rows.length&&<p className="text-muted-foreground">{es?'No hay solicitudes pendientes.':'No requests waiting.'}</p>}
    {groups.map(h=>{const houseRows=rows.filter(r=>r.property_id===h);return <section key={h} className="mb-7">
      <h3 className="font-display text-xl break-words">{properties.find(p=>p.id===h)?.name ?? (es?'Casa':'House')}</h3>
      <Button variant="ghost" className="min-h-11 h-auto whitespace-normal my-2" onClick={()=>setSelected(houseRows.every(r=>validSelected.includes(r.id))?[]:houseRows.map(r=>r.id))}>{es?'Seleccionar todo para esta casa':'Select all for this house'}</Button>
      <div className="space-y-5">{byBatch(houseRows).map(([batchId,batchRows])=><div key={batchId} id={`request-batch-${batchId}`} className={`min-w-0 p-2 border-l-2 ${highlight===batchId?'border-gold bg-gold/10':'border-border'}`}><h4 className="break-words">{data.names.get(batchRows[0].created_by??'') || (es?'Solicitante':'Requester')} · {new Date(batchRows[0].sent_at ?? batchRows[0].created_at).toLocaleString(es?'es-ES':'en-US',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} · {itemCount(batchRows.length,es)}</h4><Button variant="ghost" className="min-h-11 h-auto whitespace-normal" onClick={()=>setSelected(s=>{const sameHouse=s.every(id=>rows.find(r=>r.id===id)?.property_id===h);const base=sameHouse?s:[];return batchRows.every(r=>base.includes(r.id))?base.filter(id=>!batchRows.some(r=>r.id===id)):[...new Set([...base,...batchRows.map(r=>r.id)])];})}>{es?'Seleccionar toda esta lista':'Select all in this list'}</Button><div className="space-y-3">{batchRows.map(r=><article key={r.id} className="bg-card border border-border rounded-lg p-3 min-w-0">
        <div className="flex items-start gap-2"><label className="min-h-11 min-w-11 flex items-center justify-center"><Checkbox aria-label={`${es?'Seleccionar':'Select'} ${text(r.name)}`} checked={validSelected.includes(r.id)} onCheckedChange={()=>setSelected(s=>toggleQueueSelection(s,r,rows))}/></label>
        <RequestThumbnail row={r} library={[]} onClick={()=>setPhoto(r.photo_url)}/><div className="min-w-0 flex-1"><h4 className="break-words font-medium">{text(r.name)}</h4><p>× {r.quantity||'1'}</p>{r.urgent&&<span className="request-urgent">{es?'Urgente':'Urgent'}</span>}</div></div>
        {r.notes&&<p className="break-words mt-2">{text(r.notes)}</p>}<p className="text-muted-foreground text-sm mt-2 break-words">{data.names.get(r.created_by??'') || (es?'Solicitante':'Requester')} · {new Date(r.created_at).toLocaleString(es?'es-ES':'en-US',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</p>
        <Button variant="ghost" className="min-h-11 text-destructive" onClick={()=>setCancel(r)}>{es?'Quitar':'Remove'}</Button>
      </article>)}</div></div>)}</div></section>;})}
    {validSelected.length>0&&<div className="fixed bottom-20 left-4 right-4 mx-auto max-w-xl z-20"><Button className="min-h-16 w-full text-base" onClick={()=>setConfirm(true)}>{es?'Crear pedido':'Create order'} ({validSelected.length})</Button></div>}
    <Dialog open={confirm} onOpenChange={o=>{if(!busy)setConfirm(o);}}><DialogContent className="request-sheet h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col"><DialogHeader><DialogTitle>{es?'Crear pedido':'Create order'} ({validSelected.length})</DialogTitle></DialogHeader>
      <p>{properties.find(p=>p.id===rows.find(r=>validSelected.includes(r.id))?.property_id)?.name}</p><label className="space-y-2">{es?'Fecha estimada de entrega (opcional)':'Expected delivery date (optional)'}<Input type="date" className="h-12 text-base" value={delivery} onChange={e=>setDelivery(e.target.value)}/></label><Button className="mt-auto min-h-14" disabled={busy||!validSelected.length} onClick={create}>{es?'Crear pedido':'Create order'}</Button>
    </DialogContent></Dialog>
    <Dialog open={!!photo} onOpenChange={o=>{if(!o)setPhoto(null);}}><DialogContent className="request-sheet h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col"><DialogHeader><DialogTitle>{es?'Foto':'Photo'}</DialogTitle></DialogHeader>{photo&&<img src={photo} alt={es?'Foto de la solicitud':'Request photo'} className="object-contain min-h-0 max-h-[70dvh]"/>}</DialogContent></Dialog>
    <Dialog open={!!cancel} onOpenChange={o=>{if(!o&&!busy)setCancel(null);}}><DialogContent className="request-sheet h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col"><DialogHeader><DialogTitle>{es?'¿Quitar la solicitud?':'Remove request?'}</DialogTitle></DialogHeader><p>{text(cancel?.name)}</p><Button variant="destructive" className="mt-auto min-h-14" disabled={busy} onClick={remove}>{es?'Quitar':'Remove'}</Button></DialogContent></Dialog>
  </div>;
}
