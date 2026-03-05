// i18n translations — EN / ES
export const translations = {
  en: {
    // Navigation
    home: "Home",
    property: "Properties",
    maintenance: "Maintenance",
    messages: "Messages",
    profile: "Profile",
    more: "More",

    // Dashboard
    goodMorning: "Good Morning",
    goodAfternoon: "Good Afternoon",
    goodEvening: "Good Evening",
    commandCenter: "Command Center",
    todaySnapshot: "Today's Snapshot",
    ownerOnSite: "Owner On-Site",
    houseEmpty: "House Empty",
    activeVendors: "Active Vendors",
    globalFeed: "Global Feed",

    // Quick Actions
    myTasks: "My Tasks",
    reportIssue: "Report an Issue",
    houseManual: "House Manual",

    // Status
    occupied: "Occupied",
    vacant: "Vacant",
    maintenanceStatus: "Maintenance",
    pending: "Pending",
    inProgress: "In Progress",
    completed: "Completed",
    urgent: "Urgent",

    // Sidebar sections
    manuals: "Manuals & SOPs",
    tasks: "Tasks",
    contacts: "Contacts & Vendors",
    inventory: "Inventory & Assets",
    laundry: "Laundry",
    orders: "Orders",
    meetTeam: "Meet the Team",
    travel: "Travel",

    // Misc
    comingSoon: "Coming Soon",
    sectionUnderConstruction: "This section is being built.",
    selectProperty: "Select Property",
    allProperties: "All Properties",
    viewAll: "View All",
    addPhoto: "Add Photo",
    submit: "Submit",
    cancel: "Cancel",
    save: "Save",
    achievements: "Achievements",
    masterImport: "Master Import",
    calendar: "Calendar",
    memory: "Ronin's Memory",
  },
  es: {
    home: "Inicio",
    property: "Propiedades",
    maintenance: "Mantenimiento",
    messages: "Mensajes",
    profile: "Perfil",
    more: "Más",
    achievements: "Logros",

    commandCenter: "Centro de Mando",
    goodMorning: "Buenos días",
    goodAfternoon: "Buenas tardes",
    goodEvening: "Buenas noches",
    todaySnapshot: "Resumen de Hoy",
    ownerOnSite: "Dueño Presente",
    houseEmpty: "Casa Vacía",
    activeVendors: "Proveedores Activos",
    globalFeed: "Feed Global",

    myTasks: "Mis Tareas",
    reportIssue: "Reportar Problema",
    houseManual: "Manual de Casa",

    occupied: "Ocupado",
    vacant: "Vacante",
    maintenanceStatus: "Mantenimiento",
    pending: "Pendiente",
    inProgress: "En Progreso",
    completed: "Completado",
    urgent: "Urgente",

    manuals: "Manuales y SOPs",
    tasks: "Tareas",
    contacts: "Contactos y Proveedores",
    inventory: "Inventario y Activos",
    laundry: "Lavandería",
    orders: "Pedidos",
    meetTeam: "Conoce al Equipo",
    travel: "Viajes",

    comingSoon: "Próximamente",
    sectionUnderConstruction: "Esta sección está en construcción.",
    selectProperty: "Seleccionar Propiedad",
    allProperties: "Todas las Propiedades",
    viewAll: "Ver Todo",
    addPhoto: "Agregar Foto",
    submit: "Enviar",
    cancel: "Cancelar",
    save: "Guardar",
    masterImport: "Importación Maestra",
    calendar: "Calendario",
    memory: "Memoria de Ronin",
  },
} as const;

export type Language = "en" | "es";
export type TranslationKey = keyof typeof translations.en;
