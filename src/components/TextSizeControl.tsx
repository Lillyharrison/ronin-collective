import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTextSize } from "@/hooks/useTextSize";
import { useLanguage } from "@/contexts/LanguageContext";
import { TEXT_SIZES, TEXT_SIZE_LABELS } from "@/lib/textSize";
import { toast } from "sonner";

export function TextSizeControl({ profile = false }: { profile?: boolean }) {
  const { language } = useLanguage();
  const { size, saving, ready, save } = useTextSize();
  const [open, setOpen] = useState(false);
  const title = language === "es" ? "Tamaño del texto" : "Text size";
  const options = <div role="group" aria-label={title} className="grid gap-1">
    {TEXT_SIZES.map(value => <Button key={value} variant={value === size ? "secondary" : "ghost"} disabled={saving || !ready}
      aria-pressed={value === size} className="text-size-option h-auto min-h-14 w-full justify-start py-3 text-left"
      onClick={async () => {
        try { await save(value); setOpen(false); }
        catch { toast.error(language === "es" ? "No se pudo guardar. Inténtalo de nuevo." : "Could not save. Please try again."); }
      }}>
      <span aria-hidden="true" className={`text-size-sample text-size-sample-${value}`}>Aa</span>
      <span className="min-w-0 flex-1 break-words">{TEXT_SIZE_LABELS[value][language]}</span>
      {size === value && <Check aria-hidden="true" className="shrink-0" />}
    </Button>)}
  </div>;
  if (profile) return <section className="px-4 mt-5" aria-label={title}><h2 className="text-base font-semibold mb-3">{title}</h2>{options}</section>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={title} title={title} className="header-text-size text-gold font-semibold">Aa</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)] p-2">{options}</PopoverContent>
  </Popover>;
}