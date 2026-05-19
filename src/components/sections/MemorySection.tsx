import { useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { sortProperties } from "@/hooks/useScopedProperties";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Brain, Trash2, Star, Tag, Building2, User, Plus, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface RoninMemory {
  id: string;
  content: string;
  summary: string;
  category: string;
  importance: number;
  tags: string[];
  property_id: string | null;
  subject_user_id: string | null;
  source: string;
  created_at: string;
  last_referenced_at: string | null;
  reference_count: number;
}

interface Property { id: string; name: string; }
interface Profile { id: string; full_name: string | null; }

const CATEGORY_META: Record<string, { label: string; labelEs: string; color: string; icon: string }> = {
  principal_pref:  { label: "Principal Preference", labelEs: "Preferencia del Principal", color: "bg-primary/10 text-primary border-primary/20",   icon: "👑" },
  property_sop:    { label: "Property SOP",          labelEs: "SOP de Propiedad",          color: "bg-accent/10 text-accent border-accent/20",         icon: "🏠" },
  staff_behaviour: { label: "Staff Behaviour",        labelEs: "Comportamiento del Staff",  color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: "👤" },
  operational:     { label: "Operational Insight",   labelEs: "Insight Operativo",         color: "bg-green-500/10 text-green-600 border-green-500/20",   icon: "⚙️" },
  general:         { label: "General",               labelEs: "General",                   color: "bg-muted text-muted-foreground border-border",          icon: "📌" },
};

const SOURCE_LABELS: Record<string, string> = {
  conversation: "AI Conversation",
  manual: "Manual Entry",
  event_listener: "Event Listener",
};

export default function MemorySection() {
  const { language } = useLanguage();
  const [memories, setMemories] = useState<RoninMemory[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useLocalStorage<string>("memory.filterCategory", "all");
  const [filterImportance, setFilterImportance] = useLocalStorage<string>("memory.filterImportance", "all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // New memory form
  const [form, setForm] = useState({
    content: "", summary: "", category: "general",
    importance: 3, tags: "", property_id: "", subject_user_id: "",
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [memoriesRes, propsRes, profilesRes] = await Promise.all([
      // Narrow + cap. Memories grow indefinitely — 500 most-important is plenty for the admin UI.
      supabase
        .from("ronin_memories")
        .select("id, content, summary, category, importance, tags, source, property_id, subject_user_id, reference_count, last_referenced_at, created_at, updated_at")
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("properties").select("id, name, is_primary").limit(500),
      supabase.from("profiles").select("id, full_name").limit(500),
    ]);
    setMemories((memoriesRes.data as RoninMemory[]) ?? []);
    setProperties(sortProperties((propsRes.data ?? []) as { id: string; name: string; is_primary?: boolean }[]));
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ronin_memories").delete().eq("id", id);
    if (error) { toast.error("Failed to delete memory"); return; }
    setMemories(prev => prev.filter(m => m.id !== id));
    setDeleteId(null);
    toast.success(language === "es" ? "Memoria eliminada" : "Memory deleted");
  };

  const handleAdd = async () => {
    if (!form.content.trim() || !form.summary.trim()) {
      toast.error(language === "es" ? "El contenido y el resumen son obligatorios" : "Content and summary are required");
      return;
    }
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("ronin_memories").insert({
      content: form.content.trim(),
      summary: form.summary.trim(),
      category: form.category,
      importance: form.importance,
      tags,
      property_id: form.property_id || null,
      subject_user_id: form.subject_user_id || null,
      source: "manual",
    });
    if (error) { toast.error("Failed to save memory"); return; }
    toast.success(language === "es" ? "Memoria guardada" : "Memory saved");
    setShowAddDialog(false);
    setForm({ content: "", summary: "", category: "general", importance: 3, tags: "", property_id: "", subject_user_id: "" });
    fetchAll();
  };

  const filtered = memories.filter(m => {
    if (filterCategory !== "all" && m.category !== filterCategory) return false;
    if (filterImportance !== "all" && m.importance !== parseInt(filterImportance)) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.content.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const getPropertyName = (id: string | null) => properties.find(p => p.id === id)?.name ?? null;
  const getProfileName = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? null;

  const totalByCategory = Object.fromEntries(
    Object.keys(CATEGORY_META).map(k => [k, memories.filter(m => m.category === k).length])
  );

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Brain size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {language === "es" ? "Memoria de Ronin" : "Ronin's Memory"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {memories.length} {language === "es" ? "entradas almacenadas" : "entries stored"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5">
          <Plus size={14} />
          {language === "es" ? "Nueva Memoria" : "Add Memory"}
        </Button>
      </div>

      {/* Category Summary Chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilterCategory(filterCategory === key ? "all" : key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              filterCategory === key
                ? meta.color + " ring-1 ring-primary/30"
                : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            <span>{meta.icon}</span>
            <span>{language === "es" ? meta.labelEs : meta.label}</span>
            <span className="ml-0.5 opacity-60">({totalByCategory[key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Search + Importance Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === "es" ? "Buscar memorias..." : "Search memories..."}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={filterImportance} onValueChange={setFilterImportance}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <Filter size={12} className="mr-1" />
            <SelectValue placeholder={language === "es" ? "Importancia" : "Importance"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{language === "es" ? "Todas" : "All"}</SelectItem>
            {[5, 4, 3, 2, 1].map(n => (
              <SelectItem key={n} value={String(n)}>{"⭐".repeat(n)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Memory List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain size={40} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {memories.length === 0
              ? (language === "es" ? "Sin memorias todavía" : "No memories yet")
              : (language === "es" ? "Sin resultados" : "No results")}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
            {memories.length === 0
              ? (language === "es"
                  ? "Ronin aprenderá y guardará preferencias, SOPs y patrones a medida que interactúas."
                  : "Ronin will learn and save preferences, SOPs, and patterns as you interact.")
              : (language === "es" ? "Intenta con otros filtros." : "Try adjusting your filters.")}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(memory => {
            const meta = CATEGORY_META[memory.category] ?? CATEGORY_META.general;
            const propName = getPropertyName(memory.property_id);
            const profileName = getProfileName(memory.subject_user_id);
            return (
              <div key={memory.id} className="bg-card border border-border rounded-xl p-4 space-y-2.5 hover:border-primary/20 transition-colors group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.color}`}>
                      {meta.icon} {language === "es" ? meta.labelEs : meta.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
                      {"⭐".repeat(memory.importance)}
                    </span>
                  </div>
                  <button
                    onClick={() => setDeleteId(memory.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <p className="text-sm font-medium text-foreground leading-snug">{memory.summary}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{memory.content}</p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {propName && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      <Building2 size={9} /> {propName}
                    </span>
                  )}
                  {profileName && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      <User size={9} /> {profileName}
                    </span>
                  )}
                  {memory.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      <Tag size={9} /> {tag}
                    </span>
                  ))}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {SOURCE_LABELS[memory.source] ?? memory.source}
                    {memory.reference_count > 0 ? ` · referenced ${memory.reference_count}×` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Memory Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain size={16} className="text-primary" />
              {language === "es" ? "Añadir Memoria" : "Add Memory"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{language === "es" ? "Resumen (1 línea)" : "Summary (1 line)"} *</Label>
              <Input
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                placeholder={language === "es" ? "Ej: El Principal prefiere habitaciones frías" : "e.g. Principal prefers cool rooms at night"}
                className="text-sm"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{language === "es" ? "Contenido completo" : "Full content"} *</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={language === "es" ? "Describe el hecho, preferencia o SOP en detalle..." : "Describe the fact, preference, or SOP in detail..."}
                className="text-sm min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{language === "es" ? "Categoría" : "Category"}</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {v.icon} {language === "es" ? v.labelEs : v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{language === "es" ? "Importancia" : "Importance"}: {form.importance}{"⭐".repeat(form.importance)}</Label>
                <div className="pt-2 px-1">
                  <Slider
                    min={1} max={5} step={1}
                    value={[form.importance]}
                    onValueChange={([v]) => setForm(f => ({ ...f, importance: v }))}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{language === "es" ? "Propiedad" : "Property"}</Label>
                <Select value={form.property_id} onValueChange={v => setForm(f => ({ ...f, property_id: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={language === "es" ? "Cualquiera" : "Any"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{language === "es" ? "Cualquiera" : "Any"}</SelectItem>
                    {properties.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{language === "es" ? "Persona" : "About"}</Label>
                <Select value={form.subject_user_id} onValueChange={v => setForm(f => ({ ...f, subject_user_id: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={language === "es" ? "Cualquiera" : "Anyone"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{language === "es" ? "Sin persona" : "No one specific"}</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.full_name ?? p.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{language === "es" ? "Etiquetas (separadas por comas)" : "Tags (comma-separated)"}</Label>
              <Input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder={language === "es" ? "comida, alergia, principal" : "food, allergy, principal"}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Brain size={13} className="mr-1.5" />
              {language === "es" ? "Guardar Memoria" : "Save Memory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {language === "es" ? "¿Eliminar esta memoria?" : "Delete this memory?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {language === "es"
              ? "Esta acción es permanente. Ronin ya no tendrá acceso a este conocimiento."
              : "This is permanent. Ronin will no longer have access to this knowledge."}
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => deleteId && handleDelete(deleteId)}>
              {language === "es" ? "Eliminar" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
