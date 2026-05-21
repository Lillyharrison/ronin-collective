import { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "sonner";

// ── TYPES ──────────────────────────────────────────────────────────────────
interface Phase {
  type: "construction" | "install" | "maintenance" | "design" | "complete";
  start: [number, number];
  end: [number, number];
  label: string;
}
interface Milestone {
  date: [number, number];
  label: string;
}
interface Project {
  id: number;
  location: string;
  property: string;
  status: "construction" | "install" | "maintenance" | "design" | "complete";
  phases: Phase[];
  milestones: Milestone[];
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const COL_W = 46;
const DEFAULT_TOTAL_MONTHS = 24;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const COLORS = {
  construction: { bar: "#a8c8e8", pill: "#d0e8f8", pillText: "#0d4270" },
  install:      { bar: "#a8d8b8", pill: "#cdf0e0", pillText: "#0d5236" },
  maintenance:  { bar: "#f0cc88", pill: "#fde9c8", pillText: "#7a4a08" },
  design:       { bar: "#c8b8e8", pill: "#e6e0fa", pillText: "#3a2880" },
  complete:     { bar: "#cccccc", pill: "#e8e8e8", pillText: "#444444" },
};
const TYPE_LABEL = {
  construction: "Construction", install: "Install", maintenance: "Maintenance",
  design: "Design", complete: "Complete",
};

// ── INITIAL DATA ───────────────────────────────────────────────────────────
const INITIAL_PROJECTS: Project[] = [
  { id:1,  location:"London",      property:"Penthouse",          status:"install",
    phases:[{type:"install",      start:[2026,5], end:[2026,8],  label:"Crane lift & furniture removal"}],
    milestones:[{date:[2026,8],   label:"Aug occupancy target"}] },
  { id:2,  location:"London",      property:"Apartment 4.02",     status:"design",
    phases:[{type:"design",       start:[2026,8], end:[2027,1],  label:"Licence to Alter + design (extensive)"}],
    milestones:[] },
  { id:3,  location:"New York",    property:"502 Park Avenue",    status:"install",
    phases:[{type:"install",      start:[2026,3], end:[2026,7],  label:"Accessories / AV / lighting"}],
    milestones:[{date:[2026,5],label:"May 18th target"},{date:[2026,7],label:"8 Jul occupancy"}] },
  { id:4,  location:"New York",    property:"AMAN New York",      status:"construction",
    phases:[{type:"construction", start:[2026,3], end:[2028,3],  label:"~2 year programme"}],
    milestones:[] },
  { id:5,  location:"Aspen",       property:"135 E. Cooper",      status:"construction",
    phases:[{type:"construction", start:[2026,3], end:[2027,12], label:"On site — drywall, electrics, millwork"}],
    milestones:[{date:[2027,12],  label:"Target completion"}] },
  { id:6,  location:"Aspen",       property:"Snow Queen Lodge",   status:"design",
    phases:[{type:"design",       start:[2026,3], end:[2026,9],  label:"Preliminary designs"}],
    milestones:[] },
  { id:7,  location:"Aspen",       property:"AMAN Aspen",         status:"design",
    phases:[{type:"design",       start:[2026,8], end:[2027,6],  label:"Early investor — land TBC"}],
    milestones:[] },
  { id:8,  location:"Aspen",       property:"1 Aspen",            status:"complete",
    phases:[], milestones:[] },
  { id:9,  location:"Montana",     property:"Eglise 202",         status:"install",
    phases:[{type:"install",      start:[2026,3], end:[2026,7],  label:"Interior finishing → install"}],
    milestones:[{date:[2026,7],   label:"Jun/Jul install target"}] },
  { id:10, location:"Montana",     property:"Eglise 9A",          status:"construction",
    phases:[
      {type:"design",       start:[2026,3], end:[2026,6], label:"Design input"},
      {type:"construction", start:[2026,6], end:[2027,6], label:"Structural & mechanical"}
    ],
    milestones:[{date:[2027,6],label:"Target 2027"}] },
  { id:11, location:"Los Angeles", property:"Franklin",           status:"construction",
    phases:[
      {type:"construction", start:[2026,3], end:[2026,9], label:"Construction"},
      {type:"install",      start:[2026,9], end:[2026,10],label:"Clean & install"}
    ],
    milestones:[{date:[2026,6],label:"Jun 15 completion"}] },
  { id:12, location:"Los Angeles", property:"31042 Broad Beach",  status:"install",
    phases:[
      {type:"construction", start:[2026,3], end:[2026,9], label:"Exterior works"},
      {type:"install",      start:[2026,9], end:[2026,10],label:"Furniture install"}
    ],
    milestones:[{date:[2026,5],label:"May 15 furniture ready"}] },
  { id:13, location:"Los Angeles", property:"31038 Broad Beach",  status:"maintenance",
    phases:[{type:"maintenance",  start:[2026,3], end:[2026,5],  label:"Maintenance / feedback pending"}],
    milestones:[] },
  { id:14, location:"Los Angeles", property:"Rockingham",         status:"maintenance",
    phases:[{type:"maintenance",  start:[2026,3], end:[2026,5],  label:"HVAC + kitchen door/window"}],
    milestones:[{date:[2026,3],label:"26 Mar HVAC"}] },
  { id:15, location:"Los Angeles", property:"Moreno",             status:"complete",
    phases:[], milestones:[] },
  { id:16, location:"Los Angeles", property:"Toyopa Drive",       status:"design",
    phases:[{type:"design",       start:[2026,3], end:[2027,1],  label:"Long-range planning"}],
    milestones:[] },
  { id:17, location:"Los Angeles", property:"La Cumbre",          status:"maintenance",
    phases:[{type:"maintenance",  start:[2026,4], end:[2026,7],  label:"Erosion repair & perimeter works"}],
    milestones:[] },
  { id:18, location:"Los Angeles", property:"Bristol",            status:"complete",
    phases:[], milestones:[] },
  { id:19, location:"Miami",       property:"AMAN Miami",         status:"construction",
    phases:[{type:"construction", start:[2026,3], end:[2027,12], label:"~2 year programme"}],
    milestones:[] },
  { id:20, location:"Miami",       property:"29 Indian Creek",    status:"design",
    phases:[{type:"design",       start:[2026,3], end:[2026,12], label:"Long range planning"}],
    milestones:[] },
  { id:21, location:"Nashville",   property:"Cousin's House",     status:"maintenance",
    phases:[{type:"maintenance",  start:[2026,4], end:[2026,6],  label:"Generator works TBC"}],
    milestones:[] },
  { id:22, location:"Los Angeles", property:"Monument",           status:"maintenance",
    phases:[{type:"maintenance",  start:[2026,4], end:[2026,7],  label:"Erosion repair & perimeter works"}],
    milestones:[] },
];

// ── HELPERS ────────────────────────────────────────────────────────────────
function mo(y: number, m: number, csy: number, csm: number) {
  return (y - csy) * 12 + (m - csm);
}
function fmtYM(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function parseYM(s: string): [number, number] {
  const p = s.split("-");
  return [parseInt(p[0]), parseInt(p[1])];
}
function fmtDate(ym: [number, number]) {
  return `${MONTHS[ym[1] - 1]} ${ym[0]}`;
}
function getDue(proj: Project, csy: number, csm: number) {
  if (proj.status === "complete") return null;
  const future = proj.milestones.filter(
    (ms) => ms.date[0] > csy || (ms.date[0] === csy && ms.date[1] >= csm)
  );
  if (future.length > 0) {
    future.sort((a, b) => mo(a.date[0], a.date[1], csy, csm) - mo(b.date[0], b.date[1], csy, csm));
    return { label: fmtDate(future[0].date), desc: future[0].label };
  }
  const active = proj.phases.filter((p) => p.type !== "complete");
  if (active.length > 0) {
    active.sort((a, b) => mo(b.end[0], b.end[1], csy, csm) - mo(a.end[0], a.end[1], csy, csm));
    return { label: fmtDate(active[0].end), desc: "Est. completion" };
  }
  return null;
}

// ── BAR CANVAS COMPONENT ───────────────────────────────────────────────────
function BarCanvas({ proj, csy, csm, totalMonths }: { proj: Project; csy: number; csm: number; totalMonths: number }) {
  const ROW = 42, PAD = 3;
  const FULL_H = ROW - PAD * 2;
  const HALF_H = Math.floor(FULL_H / 2) - 1;
  const multiPhase = proj.phases.length > 1;

  const visPhases = proj.phases
    .map((ph) => ({
      ph,
      cs: Math.max(0, mo(ph.start[0], ph.start[1], csy, csm)),
      ce: Math.min(totalMonths, mo(ph.end[0], ph.end[1], csy, csm)),
    }))
    .filter((item) => item.ce > item.cs);

  return (
    <div style={{ position: "relative", width: totalMonths * COL_W, height: ROW, overflow: "visible" }}>
      {visPhases.map((item, idx) => {
        const { ph, cs, ce } = item;
        const bc = COLORS[ph.type] || COLORS.complete;
        const lane = idx % 2;
        const barH = multiPhase ? HALF_H : FULL_H;
        const barTop = multiPhase ? (lane === 0 ? PAD : PAD + HALF_H + 2) : PAD;
        const barW = (ce - cs) * COL_W - 4;
        return (
          <div
            key={idx}
            title={ph.label}
            style={{
              position: "absolute", top: barTop, height: barH,
              borderRadius: 3, cursor: "default", zIndex: 2,
              background: bc.bar,
              left: cs * COL_W + 2, width: barW,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 6px", boxSizing: "border-box", overflow: "hidden",
              color: "#1a1a1a", whiteSpace: "nowrap", textOverflow: "ellipsis",
              fontSize: 9, fontWeight: 700, lineHeight: "14px",
            }}
          >
            {ph.label}
          </div>
        );
      })}
    </div>
  );
}

// ── PHASE EDITOR ROW ───────────────────────────────────────────────────────
function PhaseRow({
  phase, idx, onChange, onRemove,
}: {
  phase: Phase; idx: number;
  onChange: (i: number, p: Phase) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div style={{
      background: "#f9f6f1", border: "1px solid #e8e3da", borderRadius: 6,
      padding: "10px 12px", marginBottom: 8,
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end",
    }}>
      {[
        { label: "Type", content: (
          <select value={phase.type}
            onChange={(e) => onChange(idx, { ...phase, type: e.target.value as Phase["type"] })}
            style={{ width: "100%", padding: "5px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 11, fontFamily: "inherit", background: "#fff" }}>
            {(["construction","install","maintenance","design","complete"] as const).map(t => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        )},
        { label: "Start", content: (
          <input type="month" value={fmtYM(phase.start[0], phase.start[1])}
            onChange={(e) => onChange(idx, { ...phase, start: parseYM(e.target.value) })}
            style={{ width: "100%", padding: "5px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 11, fontFamily: "inherit", background: "#fff" }} />
        )},
        { label: "End", content: (
          <input type="month" value={fmtYM(phase.end[0], phase.end[1])}
            onChange={(e) => onChange(idx, { ...phase, end: parseYM(e.target.value) })}
            style={{ width: "100%", padding: "5px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 11, fontFamily: "inherit", background: "#fff" }} />
        )},
        { label: "Label", content: (
          <input type="text" value={phase.label}
            onChange={(e) => onChange(idx, { ...phase, label: e.target.value })}
            style={{ width: "100%", padding: "5px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 11, fontFamily: "inherit", background: "#fff" }} />
        )},
      ].map(({ label, content }) => (
        <div key={label}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 3 }}>{label}</div>
          {content}
        </div>
      ))}
      <button onClick={() => onRemove(idx)}
        style={{ background: "#fde8e6", color: "#c0392b", border: "1px solid #f5c6c2", borderRadius: 4, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, alignSelf: "flex-end", fontFamily: "inherit" }}>
        Remove
      </button>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function GanttChart({ onBack }: { onBack?: () => void }) {
  const now = new Date();
  const CSY = now.getFullYear();
  const CSM = now.getMonth() + 1;

  const STORAGE_KEY = "ronin-gantt-projects-v1";
  const NEXTID_KEY = "ronin-gantt-nextid-v1";
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Project[];
    } catch { /* ignore invalid saved timeline data */ }
    return INITIAL_PROJECTS;
  });
  const [nextId, setNextId] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(NEXTID_KEY);
      if (raw) return parseInt(raw, 10) || 23;
    } catch { /* ignore invalid saved timeline id */ }
    return 23;
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { /* ignore storage write failures */ }
  }, [projects]);
  useEffect(() => {
    try { localStorage.setItem(NEXTID_KEY, String(nextId)); } catch { /* ignore storage write failures */ }
  }, [nextId]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorLoc, setEditorLoc] = useState("");
  const [editorProp, setEditorProp] = useState("");
  const [editorStatus, setEditorStatus] = useState<Project["status"]>("construction");
  const [editorPhases, setEditorPhases] = useState<Phase[]>([]);
  const [editorMs, setEditorMs] = useState<Milestone[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFrom, setPrintFrom] = useState(fmtYM(CSY, CSM));
  const [printTo, setPrintTo] = useState(fmtYM(CSY + 1, CSM));
  const [viewFrom, setViewFrom] = useState(fmtYM(CSY, CSM));
  const [viewTo, setViewTo] = useState(fmtYM(CSY + (CSM + 23 > 12 ? Math.floor((CSM - 1 + 23) / 12) : 0), ((CSM - 1 + 23) % 12) + 1));
  const editorRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [stickyHead, setStickyHead] = useState({ show: false, left: 0, width: 0, scrollLeft: 0 });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const updateStickyHead = () => {
      const el = tableWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const show = r.top <= 58 && r.bottom > 128;
      setStickyHead({ show, left: r.left, width: r.width, scrollLeft: el.scrollLeft });
    };
    updateStickyHead();
    window.addEventListener("scroll", updateStickyHead, { passive: true });
    window.addEventListener("resize", updateStickyHead);
    return () => {
      window.removeEventListener("scroll", updateStickyHead);
      window.removeEventListener("resize", updateStickyHead);
    };
  }, [viewFrom, viewTo]);

  // Derive visible grid origin & length from viewFrom/viewTo
  const [vsy, vsm] = parseYM(viewFrom);
  const [vey, vem] = parseYM(viewTo);
  const TOTAL_MONTHS = Math.max(1, (vey - vsy) * 12 + (vem - vsm) + 1);
  const TABLE_W = 200 + 96 + 108 + TOTAL_MONTHS * COL_W;

  const todayStr = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const locations = [...new Set(projects.map((p) => p.location))];

  function openEditor(id: number) {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    setEditingId(id);
    setEditorLoc(proj.location);
    setEditorProp(proj.property);
    setEditorStatus(proj.status);
    setEditorPhases([...proj.phases]);
    setEditorMs([...proj.milestones]);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function saveProject() {
    setProjects((prev) => prev.map((p) => p.id === editingId
      ? { ...p, location: editorLoc, property: editorProp, status: editorStatus, phases: editorPhases, milestones: editorMs }
      : p
    ));
    setEditingId(null);
  }

  function deleteProject() {
    if (!confirm("Delete this project?")) return;
    setProjects((prev) => prev.filter((p) => p.id !== editingId));
    setEditingId(null);
  }

  function addProject(loc?: string) {
    const location = loc ?? prompt("City / location?") ?? "";
    if (!location) return;
    const property = prompt(`Property name in ${location}?`) ?? "";
    if (!property) return;
    const id = nextId;
    setNextId((n) => n + 1);
    const newProj: Project = {
      id, location, property, status: "construction",
      phases: [{ type: "construction", start: [CSY, CSM], end: [CSY, Math.min(CSM + 5, 12)], label: "Works" }],
      milestones: [],
    };
    setProjects((prev) => [...prev, newProj]);
    openEditor(id);
  }

  function setRange(months: number) {
    setPrintFrom(fmtYM(CSY, CSM));
    const d = new Date(CSY, CSM - 1 + months, 1);
    setPrintTo(fmtYM(d.getFullYear(), d.getMonth() + 1));
  }

  const [exporting, setExporting] = useState(false);

  async function exportToPDF() {
    const wrap = tableWrapRef.current;
    const table = wrap?.querySelector("table") as HTMLTableElement | null;
    if (!wrap || !table) {
      toast.error("Timeline not ready");
      return;
    }

    // Temporarily switch view to print range so the capture matches user's choice
    const prevFrom = viewFrom;
    const prevTo = viewTo;
    setViewFrom(printFrom);
    setViewTo(printTo);
    setShowPrintModal(false);
    setExporting(true);

    let exportHost: HTMLDivElement | null = null;
    try {
      // Wait two animation frames for React to commit the new range
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      // Extra tick to settle layout
      await new Promise((r) => setTimeout(r, 60));

      const [esy, esm] = parseYM(printFrom);
      const [eey, eem] = parseYM(printTo);
      const exportMonths = Math.max(1, (eey - esy) * 12 + (eem - esm) + 1);
      const fixedW = 404;
      const targetW = 1620;
      const monthW = Math.max(32, Math.floor((targetW - fixedW) / exportMonths));
      const exportW = fixedW + exportMonths * monthW;
      const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
      }[char] ?? char));
      const exportYearSpans: { year: number; span: number }[] = [];
      for (let col = 0; col < exportMonths;) {
        const absM = esm - 1 + col;
        const year = esy + Math.floor(absM / 12);
        const monthIdx = ((absM % 12) + 12) % 12;
        const span = Math.min(12 - monthIdx, exportMonths - col);
        exportYearSpans.push({ year, span });
        col += span;
      }

      const monthHeaders = Array.from({ length: exportMonths }, (_, i) => {
        const absM = esm - 1 + i;
        return `<th>${MONTHS[((absM % 12) + 12) % 12]}</th>`;
      }).join("");
      const yearHeaders = exportYearSpans.map(({ year, span }) => `<th colspan="${span}" class="year">${year}</th>`).join("");
      const bodyRows = locations.map((loc) => {
        const rows = projects.filter((p) => p.location === loc).map((proj) => {
          const due = getDue(proj, CSY, CSM);
          const color = COLORS[proj.status] || COLORS.complete;
          const bars = proj.phases.map((ph, idx) => {
            const cs = Math.max(0, mo(ph.start[0], ph.start[1], esy, esm));
            const ce = Math.min(exportMonths, mo(ph.end[0], ph.end[1], esy, esm));
            if (ce <= cs) return "";
            const multi = proj.phases.length > 1;
            const top = multi ? (idx % 2 === 0 ? 3 : 22) : 3;
            const height = multi ? 17 : 36;
            const left = cs * monthW + 2;
            const width = Math.max(12, (ce - cs) * monthW - 4);
            const barColor = COLORS[ph.type]?.bar ?? COLORS.complete.bar;
            return `<div class="bar" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;line-height:${height}px;background:${barColor};">${escapeHtml(ph.label)}</div>`;
          }).join("");
          return `<tr class="project-row">
            <td class="property">${escapeHtml(proj.property)}</td>
            <td class="status"><span style="background:${color.pill};color:${color.pillText};">${TYPE_LABEL[proj.status]}</span></td>
            <td class="due">${due ? `<div class="due-date">${escapeHtml(due.label)}</div><div class="due-desc">${escapeHtml(due.desc)}</div>` : ""}</td>
            <td class="chart" colspan="${exportMonths}">${bars}</td>
          </tr>`;
        }).join("");
        return `<tr class="section-row"><td colspan="${3 + exportMonths}">${escapeHtml(loc)}</td></tr>${rows}`;
      }).join("");

      exportHost = document.createElement("div");
      exportHost.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;padding:0;margin:0;overflow:visible;z-index:-1;";
      exportHost.innerHTML = `
        <style>
          .pdf-root{width:${exportW}px;background:#fff;color:#111;font-family:Inter,Arial,sans-serif;}
          .pdf-legend{height:32px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#111;}
          .pdf-legend .items{display:flex;gap:20px;align-items:center;}
          .pdf-legend span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
          .pdf-legend i{display:inline-block;width:12px;height:12px;border-radius:3px;}
          .pdf-table{border-collapse:collapse;table-layout:fixed;width:${exportW}px;font-size:10px;}
          .pdf-table col.property-col{width:210px}.pdf-table col.status-col{width:100px}.pdf-table col.due-col{width:110px}.pdf-table col.month-col{width:${monthW}px}
          .pdf-table th{background:#1a1a1a;color:#c9a84c;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;border-right:1px solid #2a2a2a;border-bottom:1px solid #2a2a2a;padding:0 10px;height:28px;text-align:left;vertical-align:middle;}
          .pdf-table th.year{text-align:center;height:28px;border-left:2px solid #333;}
          .pdf-table thead tr.months th{height:18px;color:#777;font-size:8px;font-weight:400;text-align:center;padding:0;letter-spacing:0;text-transform:none;}
          .section-row td{height:24px;background:#202020;color:#c9a84c;font-size:9px;font-weight:800;letter-spacing:4px;text-transform:uppercase;padding:0 12px;border-bottom:1px solid #222;}
          .project-row td{height:36px;border-bottom:1px solid #e8e0d3;border-right:1px solid #e8e0d3;vertical-align:middle;background:#fff;box-sizing:border-box;}
          .project-row .property{padding:0 12px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .project-row .status{text-align:center;padding:0 6px;}
          .project-row .status span{display:inline-block;border-radius:8px;padding:3px 9px;font-size:7px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;white-space:nowrap;}
          .project-row .due{padding:4px 10px;overflow:visible;}
          .due-date{font-size:9px;line-height:12px;font-weight:800;color:#15304a;white-space:nowrap;}
          .due-desc{font-size:7.5px;line-height:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .chart{position:relative;padding:0;background-image:linear-gradient(to right,#eee 1px,transparent 1px);background-size:${monthW}px 100%;overflow:hidden;}
          .bar{position:absolute;border-radius:3px;color:#fff;font-size:7px;font-weight:800;padding:0 6px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        </style>
        <div class="pdf-root">
          <div class="pdf-legend"><div class="items">
            <span><i style="background:#1f78b4"></i>Construction</span><span><i style="background:#159260"></i>Install / Fit-out</span><span><i style="background:#d78313"></i>Maintenance</span><span><i style="background:#6b4fbd"></i>Design / Planning</span><span><i style="background:#8a8a8a"></i>Complete</span>
          </div><div>As of ${escapeHtml(todayStr)}</div></div>
          <table class="pdf-table">
            <colgroup><col class="property-col"/><col class="status-col"/><col class="due-col"/>${Array.from({ length: exportMonths }, () => `<col class="month-col"/>`).join("")}</colgroup>
            <thead><tr><th rowspan="2">Property</th><th rowspan="2">Status</th><th rowspan="2">Due /<br/>Milestone</th>${yearHeaders}</tr><tr class="months">${monthHeaders}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>`;
      document.body.appendChild(exportHost);
      const exportRoot = exportHost.querySelector(".pdf-root") as HTMLElement;

      const fullW = exportRoot.scrollWidth;
      const fullH = exportRoot.scrollHeight;

      const canvas = await html2canvas(exportRoot, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: fullW,
        height: fullH,
        windowWidth: fullW,
        windowHeight: fullH,
      });

      // Landscape A4, matching the reference: one page, width-filled, no slicing.
      const pdf = new jsPDF({ orientation: "landscape", format: "a4", unit: "mm" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const margin = 4;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;

      const scale = Math.min(availW / canvas.width, availH / canvas.height);
      const imgW = canvas.width * scale;
      const imgH = canvas.height * scale;
      const xOff = margin + (availW - imgW) / 2;
      const yOff = margin;

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", xOff, yOff, imgW, imgH);


      pdf.save(`property-timeline-${printFrom}-to-${printTo}.pdf`);
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF");
    } finally {
      if (exportHost?.parentNode) exportHost.parentNode.removeChild(exportHost);
      setExporting(false);
      // Restore original view range
      setViewFrom(prevFrom);
      setViewTo(prevTo);
    }
  }


  // Build year header spans from visible view range
  function buildYearSpans() {
    const spans: { year: number; span: number }[] = [];
    let col = 0;
    while (col < TOTAL_MONTHS) {
      const absM = vsm - 1 + col;
      const year = vsy + Math.floor(absM / 12);
      const monthIdx = ((absM % 12) + 12) % 12;
      const span = Math.min(12 - monthIdx, TOTAL_MONTHS - col);
      spans.push({ year, span });
      col += span;
    }
    return spans;
  }

  const yearSpans = buildYearSpans();

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px", border: "1px solid #ccc", borderRadius: 6,
    fontSize: 12, fontFamily: "inherit", background: "#fff", color: "#1a1a1a", width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: "#666",
    textTransform: "uppercase", letterSpacing: ".6px", display: "block", marginBottom: 4,
  };
  return (
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: 12, background: "#f2f2f2", minHeight: "100vh", color: "#1a1a1a" }}>

      {/* TOP CONTROL ROW — uses the beige space above the Property Portfolio header */}
      <div style={{ background: "#f2f2f2", padding: "10px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        {onBack ? (
          <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid transparent", background: "transparent", color: "#555", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
            ← Back
          </button>
        ) : <span />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".6px" }}>View</span>
          <input type="month" value={viewFrom} onChange={(e) => setViewFrom(e.target.value)}
            style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid #ccc", background: "#fff", color: "#1a1a1a", fontSize: 11, fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: "#888" }}>→</span>
          <input type="month" value={viewTo} min={viewFrom} onChange={(e) => setViewTo(e.target.value)}
            style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid #ccc", background: "#fff", color: "#1a1a1a", fontSize: 11, fontFamily: "inherit" }} />
          {[12, 24, 36].map((m) => (
            <button key={m} onClick={() => {
              setViewFrom(fmtYM(CSY, CSM));
              const d = new Date(CSY, CSM - 1 + (m - 1), 1);
              setViewTo(fmtYM(d.getFullYear(), d.getMonth() + 1));
            }} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #ccc", background: "#fff", color: "#555", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* TOP BAR */}
      <div style={{ background: "#1a1a1a", color: "#f0ece4", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderBottom: "1px solid #2a2a2a" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>Property Portfolio — Project Timeline</div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 2, letterSpacing: ".3px" }}>Click any project name to edit &nbsp;|&nbsp; {todayStr}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => addProject()} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #c9a84c", background: "transparent", color: "#c9a84c", cursor: "pointer", fontSize: 11, fontWeight: 600, letterSpacing: ".3px", fontFamily: "inherit" }}>
            + Add Project
          </button>
          <button onClick={() => setShowPrintModal(true)} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #444", background: "transparent", color: "#f0ece4", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
            Print / Export PDF
          </button>
        </div>
      </div>

      {/* LEGEND */}
      <div style={{ background: "#fff", padding: "10px 24px", borderBottom: "1px solid #e8e3da", display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        {([
          { color: "#a8c8e8", label: "Construction" },
          { color: "#a8d8b8", label: "Install / Fit-out" },
          { color: "#f0cc88", label: "Maintenance" },
          { color: "#c8b8e8", label: "Design / Planning" },
          { color: "#cccccc", label: "Complete" },
        ]).map(({ color, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#555" }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: color, border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0, display: "inline-block" }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#aaa", letterSpacing: ".3px" }}>Click any project name to edit</span>
      </div>

      <div style={{ padding: "20px 24px" }}>

        {/* EDITOR PANEL */}
        {editingId !== null && (
          <div ref={editorRef} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0dbd2", marginBottom: 20, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <div style={{ background: "#222", color: "#c9a84c", padding: "12px 16px", fontSize: 11, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a2a2a" }}>
              <span>Editing: {editorProp} — {editorLoc}</span>
              <button onClick={() => setEditingId(null)} style={{ background: "transparent", border: "1px solid #444", color: "#aaa", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕ Close</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 18 }}>
                {[
                  { label: "City / Location", content: <input style={inputStyle} value={editorLoc} onChange={(e) => setEditorLoc(e.target.value)} /> },
                  { label: "Property Name",   content: <input style={inputStyle} value={editorProp} onChange={(e) => setEditorProp(e.target.value)} /> },
                  { label: "Status", content: (
                    <select style={inputStyle} value={editorStatus} onChange={(e) => setEditorStatus(e.target.value as Project["status"])}>
                      {(["construction","install","maintenance","design","complete"] as const).map(t => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  )},
                ].map(({ label, content }) => (
                  <div key={label}>
                    <label style={labelStyle}>{label}</label>
                    {content}
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: "#c9a84c", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>Timeline Phases</div>
              {editorPhases.map((ph, i) => (
                <PhaseRow key={i} phase={ph} idx={i}
                  onChange={(i, p) => { const a = [...editorPhases]; a[i] = p; setEditorPhases(a); }}
                  onRemove={(i) => setEditorPhases(editorPhases.filter((_, j) => j !== i))} />
              ))}
              <button onClick={() => setEditorPhases([...editorPhases, { type: "construction", start: [CSY, CSM], end: [CSY, Math.min(CSM + 5, 12)], label: "New phase" }])}
                style={{ background: "transparent", color: "#c9a84c", border: "1px solid #c9a84c", borderRadius: 5, padding: "6px 14px", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: ".3px", fontFamily: "inherit", marginBottom: 18 }}>
                + Add Phase
              </button>

              <div style={{ fontSize: 10, fontWeight: 700, color: "#c9a84c", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8 }}>Milestones</div>
              {editorMs.map((ms, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="month" value={fmtYM(ms.date[0], ms.date[1])}
                    onChange={(e) => { const a = [...editorMs]; a[i] = { ...ms, date: parseYM(e.target.value) }; setEditorMs(a); }}
                    style={{ ...inputStyle, width: 140 }} />
                  <input type="text" value={ms.label}
                    onChange={(e) => { const a = [...editorMs]; a[i] = { ...ms, label: e.target.value }; setEditorMs(a); }}
                    style={inputStyle} placeholder="Milestone description" />
                  <button onClick={() => setEditorMs(editorMs.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>×</button>
                </div>
              ))}
              <button onClick={() => setEditorMs([...editorMs, { date: [CSY, CSM], label: "Milestone" }])}
                style={{ background: "transparent", color: "#c9a84c", border: "1px solid #c9a84c", borderRadius: 5, padding: "6px 14px", cursor: "pointer", fontSize: 10, fontWeight: 600, letterSpacing: ".3px", fontFamily: "inherit", marginBottom: 18 }}>
                + Add Milestone
              </button>

              <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid #eee", flexWrap: "wrap" }}>
                <button onClick={saveProject} style={{ padding: "7px 20px", borderRadius: 6, border: "none", background: "#c9a84c", color: "#111", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", letterSpacing: ".3px" }}>✓ Save Changes</button>
                <button onClick={deleteProject} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #3a2a2a", background: "transparent", color: "#e05555", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Delete</button>
                <button onClick={() => setEditingId(null)} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #ccc", background: "transparent", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* GANTT TABLE */}
        <div ref={tableWrapRef} onScroll={(e) => setStickyHead((s) => ({ ...s, scrollLeft: e.currentTarget.scrollLeft }))} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0dbd2", overflowX: "auto", overflowY: "visible", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: TABLE_W }}>
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 108 }} />
              {Array.from({ length: TOTAL_MONTHS }, (_, i) => <col key={i} style={{ width: COL_W }} />)}
            </colgroup>
            <thead>
              {/* Year row */}
              <tr>
                {["Property", "Status", "Due / Milestone"].map((h) => (
                  <th key={h} rowSpan={2} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "7px 14px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a2a2a", verticalAlign: "middle" }}>{h}</th>
                ))}
                {yearSpans.map(({ year, span }, i) => (
                  <th key={i} colSpan={span} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "7px 4px", textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.1)", letterSpacing: 1 }}>{year}</th>
                ))}
              </tr>
              {/* Month row */}
              <tr>
                {Array.from({ length: TOTAL_MONTHS }, (_, i) => {
                  const absM = vsm - 1 + i;
                  const mIdx = ((absM % 12) + 12) % 12;
                  const colYear = vsy + Math.floor(absM / 12);
                  const isToday = colYear === CSY && mIdx === CSM - 1;
                  return (
                    <th key={i} style={{ background: isToday ? "#c9a84c" : "#222", color: isToday ? "#111" : "#666", fontSize: 9, padding: "5px 2px", textAlign: "center", borderRight: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a", fontWeight: isToday ? 700 : 400 }}>
                      {MONTHS[mIdx]}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <>
                  {/* Section header */}
                  <tr key={`sec-${loc}`}>
                    <td colSpan={3 + TOTAL_MONTHS} style={{ background: "#222", color: "#c9a84c", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, padding: "6px 14px", borderBottom: "1px solid #2a2a2a", borderTop: "1px solid #2a2a2a" }}>
                      {loc}
                    </td>
                  </tr>
                  {/* Project rows */}
                  {projects.filter((p) => p.location === loc).map((proj) => {
                    const due = getDue(proj, CSY, CSM);
                    const c = COLORS[proj.status] || COLORS.complete;
                    return (
                      <tr key={proj.id} style={{ borderBottom: "1px solid #ede8e0" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf6f0"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                        <td onClick={() => openEditor(proj.id)} style={{ padding: "4px 14px 4px 14px", fontSize: 11, color: "#333", background: "#fbfbfb", borderRight: "1px solid #ddd", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle", height: 42 }}>
                          {proj.property} <span style={{ fontSize: 9, color: "#bbb" }}>✏</span>
                        </td>
                        <td style={{ padding: "4px 10px", textAlign: "center", background: "#fafaf8", borderRight: "1px solid #ede8e0", verticalAlign: "middle" }}>
                          <span style={{ display: "inline-block", fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: c.pill, color: c.pillText, textTransform: "uppercase", letterSpacing: ".6px", whiteSpace: "nowrap" }}>
                            {TYPE_LABEL[proj.status]}
                          </span>
                        </td>
                        <td style={{ padding: "4px 14px 4px 12px", background: "#fff", borderRight: "1px solid #ede8e0", verticalAlign: "middle" }}>
                          {due && <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#1a2e44", lineHeight: 1.4, marginBottom: 1 }}>{due.label}</div>
                            <div style={{ fontSize: 9, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>{due.desc}</div>
                          </>}
                        </td>
                        <td colSpan={TOTAL_MONTHS} style={{ padding: 0, overflow: "visible", verticalAlign: "middle" }}>
                          <BarCanvas proj={proj} csy={vsy} csm={vsm} totalMonths={TOTAL_MONTHS} />
                        </td>
                      </tr>
                    );
                  })}
                  {/* Add project row */}
                  <tr key={`add-${loc}`} onClick={() => addProject(loc)}
                    style={{ cursor: "pointer", background: "#fafaf8" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f0f7ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafaf8"; }}>
                    <td colSpan={3 + TOTAL_MONTHS} style={{ padding: "6px 14px", color: "#aaa", fontSize: 10, fontWeight: 500, letterSpacing: ".3px", borderBottom: "1px solid #ede8e0" }}>
                      + Add project in {loc}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
        {stickyHead.show && (
          <div style={{ position: "fixed", top: "calc(56px + env(safe-area-inset-top, 0px) + var(--push-banner-h, 0px) + var(--preview-banner-h, 0px))", left: stickyHead.left, width: stickyHead.width, overflow: "hidden", zIndex: 45, pointerEvents: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: TABLE_W, transform: `translateX(${-stickyHead.scrollLeft}px)` }}>
              <colgroup>
                <col style={{ width: 200 }} /><col style={{ width: 96 }} /><col style={{ width: 108 }} />
                {Array.from({ length: TOTAL_MONTHS }, (_, i) => <col key={i} style={{ width: COL_W }} />)}
              </colgroup>
              <thead>
                <tr>
                  {["Property", "Status", "Due / Milestone"].map((h) => <th key={h} rowSpan={2} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "7px 14px", textAlign: "left", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a2a2a", verticalAlign: "middle" }}>{h}</th>)}
                  {yearSpans.map(({ year, span }, i) => <th key={i} colSpan={span} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "7px 4px", textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.1)", letterSpacing: 1 }}>{year}</th>)}
                </tr>
                <tr>{Array.from({ length: TOTAL_MONTHS }, (_, i) => { const absM = vsm - 1 + i; const mIdx = ((absM % 12) + 12) % 12; const colYear = vsy + Math.floor(absM / 12); const isToday = colYear === CSY && mIdx === CSM - 1; return <th key={i} style={{ background: isToday ? "#c9a84c" : "#222", color: isToday ? "#111" : "#666", fontSize: 9, padding: "5px 2px", textAlign: "center", borderRight: "1px solid #2a2a2a", borderBottom: "1px solid #2a2a2a", fontWeight: isToday ? 700 : 400 }}>{MONTHS[mIdx]}</th>; })}</tr>
              </thead>
            </table>
          </div>
        )}
      </div>

      {/* PRINT MODAL */}
      {showPrintModal && (
        <div style={{ display: "flex", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPrintModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "28px 32px", width: 460, maxWidth: "95vw", border: "1px solid #e0dbd2", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a2e44", marginBottom: 6, letterSpacing: ".5px", textTransform: "uppercase" }}>Print / Export to PDF</h2>
            <p style={{ fontSize: 11, color: "#666", marginBottom: 18, lineHeight: 1.5 }}>Choose a date range — fewer months gives wider columns and cleaner text.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              {[{ label: "From", val: printFrom, set: setPrintFrom }, { label: "To", val: printTo, set: setPrintTo }].map(({ label, val, set }) => (
                <div key={label}>
                  <label style={labelStyle}>{label}</label>
                  <input type="month" value={val} onChange={(e) => set(e.target.value)} style={inputStyle} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>Quick ranges</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {[6, 9, 12, 18, 24].map((m) => (
                <button key={m} onClick={() => setRange(m)}
                  style={{ padding: "5px 14px", border: "1px solid #ddd", borderRadius: 5, background: "#f5f0e8", cursor: "pointer", fontSize: 10, fontWeight: 600, color: "#555", fontFamily: "inherit" }}>
                  {m} months
                </button>
              ))}
            </div>
            <div style={{ background: "#f5f0e8", borderRadius: 6, padding: "12px 14px", fontSize: 11, color: "#555", marginBottom: 20, lineHeight: 1.7, border: "1px solid #e0dbd2" }}>
              The PDF is rendered from the timeline itself on <strong>A3 landscape</strong>. Fewer months gives wider, more legible columns.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowPrintModal(false)}
                style={{ padding: "8px 18px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
              <button onClick={exportToPDF} disabled={exporting}
                style={{ padding: "8px 22px", border: "none", borderRadius: 6, background: "#c9a84c", color: "#111", cursor: exporting ? "wait" : "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", letterSpacing: ".3px", opacity: exporting ? 0.7 : 1 }}>
                {exporting ? "Generating…" : "Download PDF →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
