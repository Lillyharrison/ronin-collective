import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRoninAI } from "@/hooks/useRoninAI";
import { Upload, FileSpreadsheet, CheckCircle, Loader2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

interface ImportResult {
  task_count: number;
  summary: string;
}

export function MasterImportSection() {
  const { language } = useLanguage();
  const { importCSV, isStreaming } = useRoninAI();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load properties once
  useState(() => {
    supabase.from("properties").select("id, name").then(({ data }) => {
      if (data) setProperties(data);
    });
  });

  function readFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Only CSV files are supported.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setCsvContent(e.target?.result as string);
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }

  async function handleImport() {
    if (!csvContent) return;
    setResult(null);
    await importCSV({
      csvContent,
      propertyId: selectedProperty || undefined,
      onResult: (r) => {
        setResult(r);
        toast.success(`${r.task_count} tasks imported successfully!`);
      },
    });
  }

  function reset() {
    setFileName(null);
    setCsvContent(null);
    setResult(null);
  }

  return (
    <div className="animate-fade-in px-4 pt-4 pb-8 space-y-5">
      {/* Hero */}
      <div className="rounded-xl bg-charcoal border border-charcoal-light p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center">
            <FileSpreadsheet size={20} className="text-gold" />
          </div>
          <div>
            <h2 className="text-cream font-semibold text-sm">
              {language === "es" ? "Importación Maestra" : "Master Import"}
            </h2>
            <p className="text-cream/50 text-[11px]">
              {language === "es" ? "Carga masiva de tareas vía CSV · Impulsado por Ronin AI" : "Bulk task upload via CSV · Powered by Ronin AI"}
            </p>
          </div>
        </div>
        <p className="text-cream/60 text-xs leading-relaxed">
          {language === "es"
            ? "Sube un CSV con tareas. Ronin AI identificará la propiedad, categoría y urgencia, luego poblará la tabla de tareas y publicará un resumen en el chat."
            : "Upload a CSV of estate tasks. Ronin AI will identify the Property, Category (Housekeeping/Maintenance), and Urgency, then populate the Tasks table and post a summary in the property chat."}
        </p>
      </div>

      {/* Property selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          {language === "es" ? "Propiedad (opcional)" : "Property (optional)"}
        </label>
        <select
          value={selectedProperty}
          onChange={(e) => setSelectedProperty(e.target.value)}
          className="w-full bg-card border border-border text-foreground text-sm rounded-xl px-3 py-2.5 outline-none focus:border-gold/50"
        >
          <option value="">{language === "es" ? "Detectar desde CSV" : "Auto-detect from CSV"}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      {!csvContent ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${
            dragging ? "border-gold bg-gold/5" : "border-border hover:border-gold/40"
          }`}
        >
          <Upload size={28} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            {language === "es"
              ? "Arrastra tu CSV aquí, o toca para seleccionar"
              : "Drag your CSV here, or tap to select"}
          </p>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
            {language === "es" ? "Solo archivos .csv" : ".csv files only"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <FileSpreadsheet size={20} className="text-gold flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {csvContent.split("\n").length - 1} {language === "es" ? "filas detectadas" : "rows detected"}
            </p>
          </div>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Import button */}
      {csvContent && !result && (
        <button
          onClick={handleImport}
          disabled={isStreaming}
          className="w-full flex items-center justify-center gap-2 bg-gold text-charcoal font-semibold text-sm py-3 rounded-xl disabled:opacity-50 transition-opacity"
        >
          {isStreaming ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {language === "es" ? "Procesando con Ronin AI…" : "Processing with Ronin AI…"}
            </>
          ) : (
            <>
              <FileSpreadsheet size={16} />
              {language === "es" ? "Importar tareas" : "Import Tasks"}
            </>
          )}
        </button>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl bg-[hsl(var(--status-done)/0.08)] border border-[hsl(var(--status-done)/0.25)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-status-done" />
            <span className="text-sm font-semibold text-foreground">
              {language === "es" ? "Importación Completada" : "Import Complete"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{result.summary}</p>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-display text-status-done">{result.task_count}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">
              {language === "es" ? "tareas creadas" : "tasks created"}
            </span>
          </div>
          <button
            onClick={reset}
            className="w-full text-xs text-muted-foreground border border-border rounded-xl py-2 hover:border-gold/40 transition-colors"
          >
            {language === "es" ? "Nueva importación" : "New Import"}
          </button>
        </div>
      )}

      {/* Format guide */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-2">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          {language === "es" ? "Formato CSV esperado" : "Expected CSV Format"}
        </p>
        <pre className="text-[10px] text-muted-foreground bg-background rounded-lg p-3 overflow-x-auto">
{`title,description,category,priority,property
"Deep clean kitchen","All surfaces",housekeeping,urgent,Malibu
"Fix heating unit","HVAC issue",maintenance,normal,Montana
"Restock pantry","Order supplies",housekeeping,low,`}
        </pre>
        <p className="text-[10px] text-muted-foreground/70">
          {language === "es"
            ? "Ronin AI inferirá los campos faltantes automáticamente."
            : "Ronin AI will infer missing fields automatically."}
        </p>
      </div>
    </div>
  );
}
