import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { supabase } from "@/integrations/supabase/client";
import { useChecklistTemplates } from "@/hooks/useChecklists";
import { usePropertyRules } from "@/hooks/usePropertyRules";
import { CareGuideCard } from "@/components/manuals/CareGuideCard";
import { CareGuideDetailPage } from "@/components/sections/CareGuideDetailPage";
import { RulesManager } from "@/components/manuals/RulesManager";
import { cn } from "@/lib/utils";
import { BookOpen, Shield, ChevronDown, Plus, MapPin } from "lucide-react";

interface Property {
  id: string;
  name: string;
}

type ManualTab = "care_guides" | "rules";

const TABS: { id: ManualTab; icon: React.ReactNode; label: string; labelEs: string }[] = [
  { id: "care_guides", icon: <BookOpen size={14} />, label: "Care Guides", labelEs: "Cuidados" },
  { id: "rules",       icon: <Shield size={14} />,   label: "Rules",       labelEs: "Reglas" },
];

export function ManualsSection() {
  const { language } = useLanguage();
  const { isAdmin, assignedPropertyIds } = usePermissions();
  const { careGuideDetailId, openCareGuideDetail, closeCareGuideDetail } = useNavigation();
  const [tab, setTab] = useState<ManualTab>("care_guides");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [showPropPicker, setShowPropPicker] = useState(false);

  useEffect(() => {
    let q = supabase.from("properties").select("id, name").order("sort_order");
    if (!isAdmin && assignedPropertyIds.length > 0) {
      q = q.in("id", assignedPropertyIds);
    }
    q.then(({ data }) => {
      const props = (data as Property[]) ?? [];
      setProperties(props);
      if (props.length > 0) setSelectedPropId(props[0].id);
    });
  }, [isAdmin, assignedPropertyIds]);

  const selectedProp = properties.find(p => p.id === selectedPropId);

  const { templates: careTemplates, loading: careLoading, reload: reloadCare } = useChecklistTemplates(
    "care_guide",
    null
  );

  const { rules, loading: rulesLoading, reload: reloadRules } = usePropertyRules(
    tab === "rules" ? selectedPropId : undefined
  );

  // Full-page detail view
  if (careGuideDetailId) {
    const tpl = careTemplates.find(t => t.id === careGuideDetailId);
    if (tpl) {
      return (
        <CareGuideDetailPage
          template={tpl as any}
          onBack={closeCareGuideDetail}
          onTemplateUpdate={() => reloadCare()}
        />
      );
    }
  }

  return (
    <div className="animate-fade-in pb-4">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {language === "es" ? "Manuales" : "Manuals"} <span className="text-gold">&</span>{" "}
          {language === "es" ? "Guías" : "Guides"}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {language === "es" ? "Guías de cuidado y reglas de propiedad" : "Surface care guides & property rules"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium tracking-wide transition-all border-b-2",
              tab === t.id
                ? "border-[hsl(var(--gold))] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className={tab === t.id ? "text-[hsl(var(--gold))]" : ""}>{t.icon}</span>
            {language === "es" ? t.labelEs : t.label}
          </button>
        ))}
      </div>

      {/* Property picker for rules */}
      {tab === "rules" && properties.length > 1 && (
        <div className="px-4 mt-3">
          <div className="relative">
            <button
              onClick={() => setShowPropPicker(v => !v)}
              className="w-full flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 text-left"
            >
              <MapPin size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground truncate">{selectedProp?.name ?? "Select property"}</span>
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

      {/* CONTENT */}
      <div className="px-4 mt-4 space-y-3">

        {/* CARE GUIDES */}
        {tab === "care_guides" && (
          <>
            <p className="text-xs text-muted-foreground px-1">
              {language === "es"
                ? "Guías universales de cuidado de superficies para todas las propiedades."
                : "Universal surface care guides — tap any card to view full instructions."}
            </p>
            {careLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-card border border-border rounded-2xl animate-pulse" />)}</div>
            ) : careTemplates.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <BookOpen size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No care guides yet.</p>
              </div>
            ) : (
              careTemplates.map(tpl => (
                <CareGuideCard
                  key={tpl.id}
                  template={tpl}
                  onOpen={() => openCareGuideDetail(tpl.id)}
                />
              ))
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const title = window.prompt("Care guide title:");
                  if (!title?.trim()) return;
                  await supabase.from("checklist_templates").insert({
                    title: title.trim(), category: "care_guide", icon: "📖", color: "gold", is_universal: true,
                  });
                  reloadCare();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all"
              >
                <Plus size={14} /> Add care guide
              </button>
            )}
          </>
        )}

        {/* RULES */}
        {tab === "rules" && (
          <>
            <p className="text-xs text-muted-foreground px-1">
              {language === "es"
                ? "Reglas activadas automáticamente cuando hay un evento de calendario coincidente."
                : "Rules surface automatically on the Dashboard when a matching calendar event is active."}
            </p>
            {rulesLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}</div>
            ) : (
              <RulesManager rules={rules} propertyId={selectedPropId} onReload={reloadRules} />
            )}
          </>
        )}

      </div>
    </div>
  );
}
