// Shared constants, types, and helpers for the Meet the Team feature.
// Extracted from MeetTeamSection.tsx during the conservative refactor.

export type Level = "principal" | "extended_family" | "manager" | "staff";
export type Department = "exterior" | "interior" | "kitchen" | "security" | "office";
export type AppRole = "master_admin" | "admin" | "manager" | "staff" | "principal";

export interface SectionPerm {
  view: boolean;
  edit: boolean;
  notifications: boolean;
  scope?: "own" | "department" | "all";
}
export type SectionPermissions = Record<string, SectionPerm>;

export interface TeamMember {
  id: string;
  full_name: string | null;
  job_title: string | null;
  avatar_url: string | null;
  level: string | null;
  department: string | null;
  start_date: string | null;
  birthday: string | null;
  phone: string | null;
  notes: string | null;
  assigned_property_ids: string[] | null;
  section_permissions: SectionPermissions | null;
  quick_actions: string[];
  role?: AppRole | null;
  is_draft?: boolean;
  contracted_days_per_week?: number | null;
  contracted_hours_per_week?: number | null;
  annual_leave_days?: number | null;
}

export interface Property {
  id: string;
  name: string;
}

export interface AddUserForm {
  full_name: string;
  email: string;
  job_title: string;
  level: Level | "";
  department: Department | "";
  role: AppRole | "";
  start_date: string;
  birthday: string;
  notes: string;
}

// All navigable sections in the app
export const ALL_SECTIONS: { key: string; label: string; labelEs: string; hasEdit?: boolean; hasScope?: boolean; isFeature?: boolean; isCalendarSub?: boolean; isDashboardSub?: boolean }[] = [
  { key: "dashboard",          label: "Dashboard",           labelEs: "Panel",             hasEdit: false },
  // ── Dashboard sub-features ──
  { key: "principal-location",   label: "   ↳ Principal Location", labelEs: "   ↳ Ubicación del Principal", hasEdit: false, isFeature: true, isDashboardSub: true },
  { key: "property",           label: "Property",            labelEs: "Propiedad",         hasEdit: true  },
  { key: "maintenance",        label: "Maintenance",         labelEs: "Mantenimiento",     hasEdit: true  },
  { key: "messages",           label: "Messages",            labelEs: "Mensajes",          hasEdit: true  },
  { key: "tasks",              label: "Tasks",               labelEs: "Tareas",            hasEdit: true  },
  { key: "checklists",         label: "Checklists",          labelEs: "Listas",            hasEdit: true  },
  { key: "manuals",            label: "Manuals",             labelEs: "Manuales",          hasEdit: true  },
  { key: "contacts",           label: "Contacts",            labelEs: "Contactos",         hasEdit: true  },
  { key: "inventory",          label: "Inventory",           labelEs: "Inventario",        hasEdit: true  },
  { key: "laundry",            label: "Laundry",             labelEs: "Lavandería",        hasEdit: true  },
  { key: "orders",             label: "Orders",              labelEs: "Pedidos",           hasEdit: true  },
  { key: "meet-team",          label: "Meet the Team",       labelEs: "Equipo",            hasEdit: false },
  { key: "travel",             label: "Travel",              labelEs: "Viajes",            hasEdit: true  },
  { key: "calendar",           label: "Calendar",            labelEs: "Calendario",        hasEdit: true  },
  { key: "staff-schedule",     label: "Staff Schedule",      labelEs: "Horario del Personal", hasEdit: true, hasScope: true },
  { key: "family-movements",   label: "   ↳ Family Movements", labelEs: "   ↳ Movimientos Familiares", hasEdit: false, isFeature: true },
  // ── Calendar sub-tabs ──
  { key: "family-calendar",      label: "   ↳ Family Calendar",      labelEs: "   ↳ Calendario Familiar",    hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-travel",      label: "   ↳ Travel",               labelEs: "   ↳ Viajes",                 hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-birthdays",   label: "   ↳ Birthdays",            labelEs: "   ↳ Cumpleaños",             hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-maintenance", label: "   ↳ Maintenance",          labelEs: "   ↳ Mantenimiento",          hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-deliveries",  label: "   ↳ Deliveries",           labelEs: "   ↳ Entregas",               hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "calendar-construction",label: "   ↳ Construction / Design",labelEs: "   ↳ Construcción / Diseño",  hasEdit: false, isFeature: true, isCalendarSub: true },
  { key: "car-wash",             label: "   ↳ Car Wash",              labelEs: "   ↳ Lavado de Autos",        hasEdit: true,  isFeature: true, isCalendarSub: true },
  { key: "achievements",       label: "Achievements",        labelEs: "Logros",            hasEdit: false },
  { key: "profile",            label: "Profile",             labelEs: "Perfil",            hasEdit: true  },
];

// Quick actions available on the dashboard
export const ALL_QUICK_ACTIONS: { key: string; label: string; labelEs: string; icon: string }[] = [
  { key: "checklists",  label: "Checklists",     labelEs: "Listas",            icon: "📋" },
  { key: "orders",      label: "Orders",         labelEs: "Pedidos",           icon: "🛍️" },
  { key: "reportIssue", label: "Report Issue",   labelEs: "Reportar Problema", icon: "⚠️" },
  { key: "calendar",    label: "Calendar",       labelEs: "Calendario",        icon: "🕐" },
  { key: "staffSchedule", label: "Staff Schedule", labelEs: "Horario del Personal", icon: "📅" },
  { key: "tasks",       label: "Tasks",          labelEs: "Tareas",            icon: "✅" },
  { key: "maintenance", label: "Maintenance",    labelEs: "Mantenimiento",     icon: "🔧" },
  { key: "messages",    label: "Messages",       labelEs: "Mensajes",          icon: "💬" },
  { key: "inventory",   label: "Inventory",      labelEs: "Inventario",        icon: "📦" },
  { key: "carWash",     label: "Car Wash",       labelEs: "Lavado de Autos",   icon: "🚗" },
];

export const LEVEL_OPTIONS: { value: Level; label: string; labelEs: string }[] = [
  { value: "principal",       label: "Main Family",      labelEs: "Familia Principal" },
  { value: "extended_family", label: "Extended Family",  labelEs: "Familia Extendida" },
  { value: "manager",         label: "Manager",          labelEs: "Gerente" },
  { value: "staff",           label: "Staff",            labelEs: "Personal" },
];

export const ROLE_MAP: Record<string, AppRole> = {
  master_admin:    "master_admin",
  admin:           "admin",
  principal:       "principal",
  extended_family: "principal",
  manager:         "manager",
  staff:           "staff",
};

export const DEPT_OPTIONS: { value: Department; label: string; labelEs: string }[] = [
  { value: "exterior", label: "Exterior",  labelEs: "Exterior" },
  { value: "interior", label: "Interior",  labelEs: "Interior" },
  { value: "kitchen",  label: "Kitchen",   labelEs: "Cocina" },
  { value: "security", label: "Security",  labelEs: "Seguridad" },
  { value: "office",   label: "Office",    labelEs: "Oficina" },
];

export const LEVEL_COLORS: Record<string, string> = {
  master_admin:    "text-gold border-gold/60 bg-gold/15",
  admin:           "text-gold border-gold/40 bg-gold/10",
  principal:       "text-gold border-gold/40 bg-gold/10",
  extended_family: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  manager:         "text-blue-400 border-blue-400/40 bg-blue-400/10",
  staff:           "text-slate-300 border-slate-400/40 bg-slate-400/10",
};

export const DEPT_COLORS: Record<string, string> = {
  exterior: "text-green-400",
  interior: "text-purple-400",
  kitchen:  "text-orange-400",
  security: "text-red-400",
  office:   "text-blue-400",
};

// Default section permissions based on level
export function defaultPermissionsForLevel(level: Level | string): SectionPermissions {
  const base: Record<string, string[]> = {
    principal:       ["dashboard","property","messages","travel","calendar","meet-team","profile","achievements","principal-location","family-calendar","calendar-travel","calendar-birthdays","family-movements"],
    extended_family: ["dashboard","messages","calendar","profile","achievements","family-calendar","calendar-travel","calendar-birthdays"],
    manager:         ["dashboard","property","maintenance","messages","tasks","checklists","manuals","contacts","inventory","laundry","orders","calendar","staff-schedule","meet-team","profile","achievements","principal-location","family-calendar","calendar-travel","calendar-birthdays","calendar-maintenance","calendar-deliveries","family-movements"],
    staff:           ["dashboard","maintenance","messages","tasks","checklists","manuals","laundry","calendar","staff-schedule","profile","achievements","calendar-travel","calendar-birthdays","calendar-maintenance"],
  };
  const allowed = base[level] || base["staff"];
  const perms: SectionPermissions = {};
  ALL_SECTIONS.forEach(s => {
    const entry: SectionPerm = {
      view: allowed.includes(s.key),
      edit: allowed.includes(s.key) && (s.hasEdit ?? false),
      notifications: allowed.includes(s.key),
    };
    if (s.hasScope) {
      entry.scope = (level === "manager" || level === "principal" || level === "extended_family") ? "all" : "own";
    }
    perms[s.key] = entry;
  });
  return perms;
}

// Default quick actions per level
export function defaultQuickActionsForLevel(level: Level | string): string[] {
  const base: Record<string, string[]> = {
    principal:       ["calendar", "reportIssue"],
    extended_family: ["calendar", "messages"],
    manager:         ["checklists", "orders", "reportIssue", "calendar"],
    staff:           ["checklists", "reportIssue", "tasks", "calendar"],
  };
  return base[level] || base["staff"];
}
