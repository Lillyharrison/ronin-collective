import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigation } from "@/contexts/NavigationContext";
import { supabase } from "@/integrations/supabase/client";
import { useChecklistTemplates } from "@/hooks/useChecklists";
import { ChecklistCard } from "@/components/manuals/ChecklistCard";
import { cn } from "@/lib/utils";
import {
  ClipboardList, Backpack, ChevronDown, Plus, MapPin,
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
  const { language } = useLanguage();
  const { isAdmin, assignedPropertyIds } = usePermissions();
  const { openChecklistDetail, checklistsForPropertyId, setChecklistsForPropertyId } = useNavigation();
  const [tab, setTab] = useState<Tab>("cleaning");
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(checklistsForPropertyId ?? null);
  const [showPropPicker, setShowPropPicker] = useState(false);

  useEffect(() => {
    let q = supabase.from("properties").select("id, name").order("sort_order");
    if (!isAdmin && assignedPropertyIds.length > 0) q = q.in("id", assignedPropertyIds);
    q.then(({ data }) => {
      const props = (data as Property[]) ?? [];
      setProperties(props);
      // If we have a deep-link property, use it; else default to first
      if (checklistsForPropertyId) {
        setSelectedPropId(checklistsForPropertyId);
        setChecklistsForPropertyId(null); // clear after use
      } else if (!selectedPropId && props.length > 0) {
        setSelectedPropId(props[0].id);
      }
    });
  }, [isAdmin, assignedPropertyIds]);

  const selectedProp = properties.find(p => p.id === selectedPropId);

  const { templates: cleaningTemplates, loading: cleaningLoading } = useChecklistTemplates(
    tab === "cleaning" ? "cleaning" : undefined,
    tab === "cleaning" ? selectedPropId : undefined
  );

  const { templates: activityTemplates, loading: activityLoading } = useChecklistTemplates(
    tab === "activity" ? "activity" : undefined,
    tab === "activity" ? null : undefined
  );

  const TABS = [
    { id: "cleaning" as Tab,  icon: <ClipboardList size={14} />, label: "Checklists",   labelEs: "Listas" },
    { id: "activity" as Tab,  icon: <Backpack size={14} />,      label: "Activities",   labelEs: "Actividades" },
  ];

  return (
    <div className="animate-fade-in pb-4">
      {/* Header */}
      <div className="bg-charcoal px-5 pt-6 pb-4 border-b border-charcoal-light">
        <h1 className="font-display text-3xl text-cream leading-tight">
          {language === "es" ? "Listas de" : "Checklists"} <span className="text-gold">&</span>{" "}
          {language === "es" ? "Actividades" : "Activities"}
        </h1>
        <p className="text-cream/40 text-xs mt-1 tracking-wide">
          {language === "es" ? "Listas operacionales y de actividades" : "Operational checklists and activity lists"}
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

      {/* Property picker for cleaning tab */}
      {tab === "cleaning" && properties.length > 1 && (
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

      <div className="px-4 mt-4 space-y-3">
        {/* CLEANING CHECKLISTS */}
        {tab === "cleaning" && (
          <>
            {cleaningLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />)}
              </div>
            ) : cleaningTemplates.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <ClipboardList size={28} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No checklists for this property.</p>
              </div>
            ) : (
              cleaningTemplates.map(tpl => (
                <ChecklistCard
                  key={tpl.id}
                  template={tpl}
                  propertyId={selectedPropId}
                  onOpenDetail={() => openChecklistDetail(tpl.id, selectedPropId)}
                />
              ))
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const title = window.prompt("Checklist title:");
                  if (!title?.trim()) return;
                  await supabase.from("checklist_templates").insert({
                    title: title.trim(), category: "cleaning", icon: "✅", color: "green",
                    property_id: selectedPropId,
                  });
                  window.location.reload();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all"
              >
                <Plus size={14} /> Add checklist
              </button>
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
            {isAdmin && (
              <button
                onClick={async () => {
                  const title = window.prompt("Activity list title:");
                  if (!title?.trim()) return;
                  await supabase.from("checklist_templates").insert({
                    title: title.trim(), category: "activity",
                    subcategory: title.trim().toLowerCase().replace(/\s+/g, "_"),
                    icon: "🎯", color: "blue", is_universal: true,
                  });
                  window.location.reload();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-gold hover:text-foreground transition-all"
              >
                <Plus size={14} /> Add activity list
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
