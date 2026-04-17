import { useState, useEffect } from "react";
import { sortProperties } from "@/hooks/useScopedProperties";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { supabase } from "@/integrations/supabase/client";
import { useChecklistTemplates } from "@/hooks/useChecklists";
import { ChecklistCard } from "@/components/manuals/ChecklistCard";
import { ChecklistImportModal } from "@/components/manuals/ChecklistImportModal";
import { cn } from "@/lib/utils";
import {
  ClipboardList, Backpack, ChevronDown, Plus, MapPin, Upload,
} from "lucide-react";

interface Property {
  id: string;
  name: string;
}

type Tab = "cleaning" | "activity";

const ACTIVITY_GROUPS = [
  { label: "Packing Lists",    labelEs: "Listas de Equipaje",      keys: ["skiing", "yacht", "business_trip"] },
  { label: "Events & Parties", labelEs: "Eventos & Fiestas",       keys: ["dinner_party", "staff_function", "bbq"] },
  { label: "Kids Activities",  labelEs: "Actividades Infantiles",   keys: ["football", "baseball", "basketball", "dance"] },
];

export function ChecklistsSection() {
  const { language, t } = useLanguage();
  const { isAdmin, assignedPropertyIds, canEdit } = usePermissions();
  const canManageChecklists = isAdmin || canEdit("checklists");
  const { openChecklistDetail, checklistsForPropertyId, setChecklistsForPropertyId } = useNavigation();
  const [tab, setTab] = useState<Tab>("cleaning");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(checklistsForPropertyId ?? null);
  const [showPropPicker, setShowPropPicker] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const TABS = [
    { id: "cleaning" as Tab,  icon: <ClipboardList size={14} />, label: "Checklists",   labelEs: t("checklists") },
    { id: "activity" as Tab,  icon: <Backpack size={14} />,      label: "Activities",   labelEs: t("activitiesTitle") },
  ];

  useEffect(() => {
    let q = supabase.from("properties").select("id, name, is_primary");
    if (!isAdmin && assignedPropertyIds.length > 0) q = q.in("id", assignedPropertyIds);
    q.then(({ data }) => {
      const props = sortProperties((data as Property[]) ?? []);
      setProperties(props);
      if (checklistsForPropertyId) {
        setSelectedPropId(checklistsForPropertyId);
        setChecklistsForPropertyId(null);
      }
    });
  }, [isAdmin, assignedPropertyIds]);

  const selectedProp = properties.find(p => p.id === selectedPropId);

  const { templates: cleaningTemplates, loading: cleaningLoading, reload: reloadCleaning } = useChecklistTemplates(
    tab === "cleaning" ? "cleaning" : undefined,
    tab === "cleaning" ? selectedPropId : undefined
  );

  // All subcategory keys flattened — fetch only what exists, grouped client-side for display
  const ALL_ACTIVITY_KEYS = ACTIVITY_GROUPS.flatMap(g => g.keys);
  const { templates: activityTemplates, loading: activityLoading, reload: reloadActivity } = useChecklistTemplates(
    tab === "activity" ? "activity" : undefined,
    tab === "activity" ? null : undefined,
    tab === "activity" ? ALL_ACTIVITY_KEYS : undefined,
  );

  return (
    <div className="animate-fade-in pb-4">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {t("checklistsTitle")} <span className="text-gold">&</span>{" "}
          {t("activitiesTitle")}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {t("operationalChecklists")}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {TABS.map(tab_ => (
          <button
            key={tab_.id}
            onClick={() => setTab(tab_.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium tracking-wide transition-all border-b-2",
              tab === tab_.id
                ? "border-[hsl(var(--gold))] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className={tab === tab_.id ? "text-[hsl(var(--gold))]" : ""}>{tab_.icon}</span>
            {language === "es" ? tab_.labelEs : tab_.label}
          </button>
        ))}
      </div>

      {/* Property picker for cleaning tab */}
      {tab === "cleaning" && properties.length > 0 && (
        <div className="px-4 mt-3">
          <div className="relative">
            <button
              onClick={() => setShowPropPicker(v => !v)}
              className="w-full flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 text-left"
            >
              <MapPin size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground truncate">
                {selectedProp?.name ?? (language === "es" ? "Selecciona una propiedad…" : "Select a property…")}
              </span>
              <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", showPropPicker && "rotate-180")} />
            </button>
            {showPropPicker && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {properties.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPropId(p.id); setShowPropPicker(false); }}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2",
                      p.id === selectedPropId && "text-[hsl(var(--gold))] font-medium"
                    )}
                  >
                    <MapPin size={12} className={p.id === selectedPropId ? "text-[hsl(var(--gold))]" : "text-muted-foreground"} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mt-4 space-y-3">
        {/* CLEANING CHECKLISTS */}
        {tab === "cleaning" && (
          <>
            {!selectedPropId ? (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
                <MapPin size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-foreground">{t("selectPropertyPrompt")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("choosePropertyAbove")}</p>
              </div>
            ) : cleaningLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />)}
              </div>
            ) : cleaningTemplates.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <ClipboardList size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t("noChecklistsForProperty")}</p>
              </div>
            ) : (
              cleaningTemplates.map(tpl => (
                <ChecklistCard
                  key={tpl.id}
                  template={tpl}
                  propertyId={selectedPropId}
                  onOpenDetail={() => openChecklistDetail(tpl.id, selectedPropId)}
                  onChanged={reloadCleaning}
                />
              ))
            )}
            {canManageChecklists && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    const title = window.prompt(language === "es" ? "Título de la lista:" : "Checklist title:");
                    if (!title?.trim()) return;
                    await supabase.from("checklist_templates").insert({
                      title: title.trim(), category: "cleaning", icon: "✅", color: "green",
                      property_id: selectedPropId,
                    });
                    reloadCleaning();
                  }}
                  className="flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all"
                >
                  <Plus size={14} /> {t("addChecklist")}
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  disabled={!selectedPropId}
                  className="flex items-center justify-center gap-2 py-3 border border-dashed border-gold/40 rounded-xl text-sm text-gold hover:bg-gold/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload size={14} /> {language === "es" ? "Importar archivo" : "Import file"}
                </button>
              </div>
            )}
          </>
        )}

        {/* ACTIVITY LISTS */}
        {tab === "activity" && (
          <>
            {activityLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />)}</div>
            ) : (
              ACTIVITY_GROUPS.map(group => {
                // templates are already pre-filtered by DB; just group locally
                const groupTemplates = activityTemplates.filter(t => group.keys.includes(t.subcategory ?? ""));
                if (groupTemplates.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      {language === "es" ? group.labelEs : group.label}
                    </p>
                    <div className="space-y-2">
                      {groupTemplates.map(tpl => (
                        <ChecklistCard
                          key={tpl.id}
                          template={tpl}
                          propertyId={null}
                          onOpenDetail={() => openChecklistDetail(tpl.id, null)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            {canManageChecklists && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    const title = window.prompt(language === "es" ? "Título de la lista de actividad:" : "Activity list title:");
                    if (!title?.trim()) return;
                    await supabase.from("checklist_templates").insert({
                      title: title.trim(), category: "activity",
                      subcategory: title.trim().toLowerCase().replace(/\s+/g, "_"),
                      icon: "🎯", color: "blue", is_universal: true,
                    });
                    window.location.reload();
                  }}
                  className="flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all"
                >
                  <Plus size={14} /> {t("addActivityList")}
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center justify-center gap-2 py-3 border border-dashed border-gold/40 rounded-xl text-sm text-gold hover:bg-gold/5 transition-all"
                >
                  <Upload size={14} /> {language === "es" ? "Importar archivo" : "Import file"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ChecklistImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        propertyId={tab === "cleaning" ? selectedPropId : null}
        onImported={() => {
          if (tab === "cleaning") reloadCleaning();
          else window.location.reload();
        }}
      />
    </div>
  );
}
