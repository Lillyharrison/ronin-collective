import './requests.css';
import { useEffect, useRef, useState } from 'react';
import { Camera, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { canChangeRequest, compressRequestPhoto, defaultQuantity, requestPayload, requestPhotoPath, validRequest, type HouseRequest, type RequestLibraryItem } from './logic';

export function QuantityStepper({ value, onChange, es }: { value: number; onChange: (n:number) => void; es: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span>{es ? 'Cantidad' : 'Quantity'}</span><div className="flex items-center gap-4">
    <Button type="button" variant="outline" size="icon" className="h-14 w-14" aria-label={es ? 'Menos' : 'Decrease quantity'} disabled={value <= 1} onClick={() => onChange(Math.max(1,value-1))}><Minus /></Button>
    <output className="w-10 text-center text-xl tabular-nums">{value}</output>
    <Button type="button" variant="outline" size="icon" className="h-14 w-14" aria-label={es ? 'Más' : 'Increase quantity'} onClick={() => onChange(value+1)}><Plus /></Button>
  </div></div>;
}
const failure = (es: boolean) => es ? 'No se pudo guardar. Comprueba tu conexión y vuelve a intentarlo; tu solicitud sigue aquí.' : 'Could not save. Check your connection and try again; your request is still here.';

export function RequestScreen({ houseId, userId, es, onSent }: { houseId: string; userId: string; es: boolean; onSent: () => void }) {
  const [name,setName] = useState(''); const [notes,setNotes] = useState(''); const [quantity,setQuantity] = useState(1);
  const [urgent,setUrgent] = useState(false); const [file,setFile] = useState<File|null>(null); const [preview,setPreview] = useState('');
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const uploaded = useRef<{ file: File; url: string }|null>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const send = async () => {
    if (busy || !validRequest(name,file)) return;
    setBusy(true); setError('');
    try {
      let photoUrl: string|null = null;
      if (file) {
        if (uploaded.current?.file === file) photoUrl = uploaded.current.url;
        else {
          const blob = await compressRequestPhoto(file); const path = requestPhotoPath();
          const { error: uploadError } = await supabase.storage.from('order-library').upload(path,blob,{ contentType:'image/jpeg', upsert:false });
          if (uploadError) throw uploadError;
          photoUrl = supabase.storage.from('order-library').getPublicUrl(path).data.publicUrl;
          uploaded.current = { file, url: photoUrl };
        }
      }
      const payload = requestPayload({ houseId,userId,name,quantity,notes,urgent,photoUrl });
      const { data, error: insertError } = await supabase.from('shopping_list_items').insert(payload).select('id').single();
      if (insertError || !data) throw insertError ?? new Error('Not saved');
      toast.success(es ? 'Solicitud enviada' : 'Request sent'); onSent();
    } catch { setError(failure(es)); } finally { setBusy(false); }
  };
  return <div className="space-y-5 text-base">
    <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const next = e.target.files?.[0]; if (next) {setFile(next); setError('');} e.target.value=''; }} />
    <Button variant="outline" disabled={busy} className="w-full h-auto min-h-48 border-2 border-dashed border-gold/50 bg-gold/5 flex flex-col gap-3 py-5 whitespace-normal" onClick={() => input.current?.click()}>
      {preview ? <img src={preview} alt={es ? 'Foto de la solicitud' : 'Request photo'} className="h-40 max-w-full object-contain rounded-lg" /> : <Camera className="!h-12 !w-12 text-gold" />}
      {preview ? (es ? 'Repetir foto' : 'Retake') : (es ? 'Toca para hacer una foto' : 'Tap to take a photo')}
    </Button>
    <label className="block space-y-2">{es ? '¿Qué es? (opcional)' : 'What is it? (optional)'}<Input className="h-12 text-base" value={name} disabled={busy} onChange={e=>setName(e.target.value)} /></label>
    <QuantityStepper value={quantity} onChange={setQuantity} es={es} />
    <label className="block space-y-2">{es ? 'Nota (opcional)' : 'Note (optional)'}<Textarea className="text-base" value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)} /></label>
    <label className="flex items-center justify-between min-h-14 gap-3 request-urgent"><span>{es ? 'Se necesita con urgencia' : 'Needed urgently'}</span><span className="flex min-h-11 items-center"><Switch checked={urgent} disabled={busy} onCheckedChange={setUrgent} className="data-[state=checked]:bg-status-progress" /></span></label>
    {!validRequest(name,file) && <p className="text-muted-foreground text-sm">{es ? 'Añade una foto o escribe qué necesitas.' : 'Add a photo or say what you need.'}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button className="w-full min-h-16 text-base" disabled={busy || !validRequest(name,file)} onClick={send}>{busy ? (es ? 'Enviando…' : 'Sending…') : error ? (es ? 'Reintentar' : 'Retry') : (es ? 'Enviar solicitud' : 'Send request')}</Button>
  </div>;
}

export function RequestEditSheet({ item, row, houseId, userId, es, onClose, onSaved }: {
  item?: RequestLibraryItem; row?: HouseRequest; houseId:string; userId:string; es:boolean; onClose:()=>void; onSaved:()=>void;
}) {
  const [quantity,setQuantity] = useState(defaultQuantity(row?.quantity ?? item?.default_quantity ?? null));
  const [notes,setNotes] = useState(row?.notes ?? ''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const save = async () => {
    if (busy || (row && !canChangeRequest(row,userId))) return;
    setBusy(true); setError('');
    try {
      const result = row ? await supabase.from('shopping_list_items').update({quantity:String(quantity),notes:notes.trim() || null}).eq('id',row.id).eq('created_by',userId).eq('status','requested').select('id').single()
        : await supabase.from('shopping_list_items').insert(requestPayload({houseId,userId,name:item?.name ?? '',quantity,notes,libraryItem:item})).select('id').single();
      if (result.error || !result.data) throw result.error ?? new Error('Not saved');
      toast.success(es ? 'Guardado en tu lista' : 'Saved to your list'); onSaved(); onClose();
    } catch { setError(failure(es)); } finally {setBusy(false);}
  };
  return <Dialog open onOpenChange={open=>{if(!open && !busy) onClose();}}><DialogContent className="request-sheet h-[90dvh] sm:h-auto sm:max-h-[90dvh] overflow-hidden flex flex-col max-w-lg">
    <DialogHeader><DialogTitle className="break-words">{row?.name ?? item?.name}</DialogTitle></DialogHeader>
    <div className="space-y-5 py-4"><QuantityStepper value={quantity} onChange={setQuantity} es={es}/><label className="block space-y-2">{es ? 'Nota (opcional)' : 'Note (optional)'}<Textarea className="text-base" value={notes} onChange={e=>setNotes(e.target.value)} /></label>{error && <p role="alert" className="text-destructive">{error}</p>}</div>
    <div className="mt-auto border-t border-border pt-3"><Button className="w-full min-h-14 text-base" disabled={busy} onClick={save}>{busy ? (es ? 'Guardando…' : 'Saving…') : row ? (es ? 'Guardar' : 'Save') : (es ? 'Añadir a mi lista' : 'Add to my list')}</Button></div>
  </DialogContent></Dialog>;
}
