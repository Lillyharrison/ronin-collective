import { useState, useEffect } from "react";
import { sortProperties } from "@/hooks/useScopedProperties";
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
import { BookOpen, Shield, ChevronDown, Plus, MapPin, CheckCheck } from "lucide-react";

interface Property {
  id: string;
  name: string;
}

type ManualTab = "care_guides" | "rules";

export function ManualsSection() {
  const { language, t } = useLanguage();
  const { isAdmin, assignedPropertyIds } = usePermissions();
  const { careGuideDetailId, openCareGuideDetail, closeCareGuideDetail } = useNavigation();
  const [tab, setTab] = useState<ManualTab>("care_guides");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [showPropPicker, setShowPropPicker] = useState(false);

  const TABS: { id: ManualTab; icon: React.ReactNode; label: string; labelEs: string }[] = [
    { id: "care_guides", icon: <BookOpen size={14} />, label: "Care Guides", labelEs: t("careGuides") },
    { id: "rules",       icon: <Shield size={14} />,   label: "Rules",       labelEs: t("rules") },
  ];

  useEffect(() => {
    let q = supabase.from("properties").select("id, name, is_primary");
    if (!isAdmin && assignedPropertyIds.length > 0) {
      q = q.in("id", assignedPropertyIds);
    }
    q.then(({ data }) => {
      const props = sortProperties((data as Property[]) ?? []);
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
          {t("manualsTitle")} <span className="text-gold">&</span>{" "}
          {t("guidesTitle")}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {t("careGuidesAndRules")}
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

      {/* Property picker for rules */}
      {tab === "rules" && properties.length > 1 && (
        <div className="px-4 mt-3">
          <div className="relative">
            <button
              onClick={() => setShowPropPicker(v => !v)}
              className="w-full flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 text-left"
            >
              <MapPin size={14} className="text-[hsl(var(--gold))] flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-foreground truncate">
                {selectedProp?.name ?? t("selectPropertyAbove")}
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
                <p className="text-sm text-muted-foreground">{t("noCareGuides")}</p>
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
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const title = window.prompt(language === "es" ? "Título de la guía:" : "Care guide title:");
                    if (!title?.trim()) return;
                    await supabase.from("checklist_templates").insert({
                      title: title.trim(), category: "care_guide", icon: "📖", color: "gold", is_universal: true,
                    });
                    reloadCare();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-[hsl(var(--gold))] hover:text-foreground transition-all"
                >
                  <Plus size={14} /> {t("addCareGuide")}
                </button>
                {careTemplates.some(t => !t.is_published) && (
                  <button
                    onClick={async () => {
                      const draftIds = careTemplates.filter(t => !t.is_published).map(t => t.id);
                      await supabase.from("checklist_templates")
                        .update({ is_published: true })
                        .in("id", draftIds);
                      reloadCare();
                    }}
                    className="flex items-center gap-1.5 px-4 py-3 border border-dashed border-[hsl(var(--status-done)/0.4)] rounded-xl text-sm text-[hsl(var(--status-done))] hover:bg-[hsl(var(--status-done)/0.08)] transition-all whitespace-nowrap"
                  >
                    <CheckCheck size={14} /> {t("publishAllDrafts")}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* RULES */}
        {tab === "rules" && (
          <>
            <p className="text-xs text-muted-foreground px-1">
              {t("rulesAutoSurface")}
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
