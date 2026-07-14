import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

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

const COL_W = 46;
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

const SHARE_TOKEN = "ronin-public-timeline-share-v1";

const INITIAL_PROJECTS: Project[] = [
  { id:1,  location:"London",      property:"Penthouse",          status:"install",
    phases:[{type:"install",      start:[2026,5], end:[2026,8],  label:"Furniture removal (crane)"}],
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

function BarCanvas({ proj, csy, csm, totalMonths }: { proj: Project; csy: number; csm: number; totalMonths: number }) {
  const ROW = 44, PAD = 3;
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
    <div style={{ position: "relative", width: "100%", height: ROW, overflow: "visible" }}>
      {visPhases.map((item, idx) => {
        const { ph, cs, ce } = item;
        const bc = COLORS[ph.type] || COLORS.complete;
        const lane = idx % 2;
        const barH = multiPhase ? HALF_H : FULL_H;
        const barTop = multiPhase ? (lane === 0 ? PAD : PAD + HALF_H + 2) : PAD;
        const barW = (ce - cs) * COL_W - 4;
        const lblTop = barTop + Math.floor(barH / 2) - 7;
        return (
          <div key={idx}>
            <div
              title={ph.label}
              style={{
                position: "absolute", top: barTop, height: barH,
                borderRadius: 3, cursor: "default", zIndex: 2,
                background: bc.bar,
                left: cs * COL_W + 2, width: barW,
              }}
            />
            <div
              style={{
                position: "absolute", top: lblTop, left: cs * COL_W + 7,
                height: 14, lineHeight: "14px", fontSize: 10, fontWeight: 700,
                color: "#1a1a1a", whiteSpace: "nowrap", zIndex: 4 + lane,
                pointerEvents: "none", letterSpacing: "0.1px",
              }}
            >
              {ph.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
      {([
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
      ]).map(({ label, content }: { label: string; content: React.ReactNode }) => (
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

export default function GanttChart(_props?: { onBack?: () => void }) {
  const now = new Date();
  const CSY = now.getFullYear();
  const CSM = now.getMonth() + 1;
  const { toast } = useToast();

  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [nextId, setNextId] = useState(23);
  const [isLoadingBoard, setIsLoadingBoard] = useState(true);
  const [isSavingBoard, setIsSavingBoard] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorLoc, setEditorLoc] = useState("");
  const [editorProp, setEditorProp] = useState("");
  const [editorStatus, setEditorStatus] = useState<Project["status"]>("construction");
  const [editorPhases, setEditorPhases] = useState<Phase[]>([]);
  const [editorMs, setEditorMs] = useState<Milestone[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFrom, setPrintFrom] = useState(fmtYM(CSY, CSM));
  const [printTo, setPrintTo] = useState(fmtYM(CSY + 1, CSM));
  const editorRef = useRef<HTMLDivElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const [viewFrom, setViewFrom] = useState<[number,number]>([CSY, CSM]);
  const [viewTo, setViewTo] = useState<[number,number]>([CSY+2, CSM]);
  const viewMonths = Math.max(1, (viewTo[0]-viewFrom[0])*12+(viewTo[1]-viewFrom[1]));

  const locations = [...new Set(projects.map((p) => p.location))];

  useEffect(() => {
    let cancelled = false;
    async function loadBoard() {
      setIsLoadingBoard(true);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/timeline-share-get`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: SHARE_TOKEN }),
          },
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.projects) {
            setProjects(data.projects as unknown as Project[]);
            setNextId(data.next_id ?? 1);
          }
        } else if (res.status !== 404) {
          const txt = await res.text();
          toast({ title: "Timeline not loaded", description: txt, variant: "destructive" });
        }
      } catch (e) {
        if (!cancelled) {
          toast({ title: "Timeline not loaded", description: String((e as Error)?.message ?? e), variant: "destructive" });
        }
      }
      if (!cancelled) setIsLoadingBoard(false);
    }
    loadBoard();
    return () => { cancelled = true; };
  }, [toast]);

  async function saveBoard(nextProjects: Project[], nextNextId = nextId) {
    setIsSavingBoard(true);
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/timeline-share-save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: SHARE_TOKEN,
            projects: nextProjects,
            next_id: nextNextId,
            total_months: viewMonths,
            create_if_missing: true,
          }),
        },
      );
      setIsSavingBoard(false);
      if (!res.ok) {
        const txt = await res.text();
        toast({ title: "Timeline not saved", description: txt, variant: "destructive" });
        return false;
      }
      return true;
    } catch (e) {
      setIsSavingBoard(false);
      toast({ title: "Timeline not saved", description: String((e as Error)?.message ?? e), variant: "destructive" });
      return false;
    }
  }

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

  async function saveProject() {
    const nextProjects = projects.map((p) => p.id === editingId
      ? { ...p, location: editorLoc, property: editorProp, status: editorStatus, phases: editorPhases, milestones: editorMs }
      : p
    );
    if (!(await saveBoard(nextProjects))) return;
    setProjects(nextProjects);
    setEditingId(null);
  }

  async function deleteProject() {
    if (!confirm("Delete this project?")) return;
    const nextProjects = projects.filter((p) => p.id !== editingId);
    if (!(await saveBoard(nextProjects))) return;
    setProjects(nextProjects);
    setEditingId(null);
  }

  async function addProject(loc?: string) {
    const location = loc ?? prompt("City / location?") ?? "";
    if (!location) return;
    const property = prompt(`Property name in ${location}?`) ?? "";
    if (!property) return;
    const id = nextId;
    const newProj: Project = {
      id, location, property, status: "construction",
      phases: [{ type: "construction", start: [CSY, CSM], end: [CSY, Math.min(CSM + 5, 12)], label: "Works" }],
      milestones: [],
    };
    const nextProjects = [...projects, newProj];
    if (!(await saveBoard(nextProjects, id + 1))) return;
    setNextId(id + 1);
    setProjects(nextProjects);
    setEditingId(id);
    setEditorLoc(newProj.location);
    setEditorProp(newProj.property);
    setEditorStatus(newProj.status);
    setEditorPhases([...newProj.phases]);
    setEditorMs([...newProj.milestones]);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function setRange(months: number) {
    setPrintFrom(fmtYM(CSY, CSM));
    const d = new Date(CSY, CSM - 1 + months, 1);
    setPrintTo(fmtYM(d.getFullYear(), d.getMonth() + 1));
  }

  function buildYearSpans() {
    const spans: { year: number; span: number }[] = [];
    let col = 0;
    while (col < viewMonths) {
      const absM = viewFrom[1] - 1 + col;
      const year = viewFrom[0] + Math.floor(absM / 12);
      const monthIdx = absM % 12;
      const span = Math.min(12 - monthIdx, viewMonths - col);
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

  const legendItems: { color: string; label: string }[] = [
    { color: "#a8c8e8", label: "Construction" },
    { color: "#a8d8b8", label: "Install / Fit-out" },
    { color: "#f0cc88", label: "Maintenance" },
    { color: "#c8b8e8", label: "Design / Planning" },
    { color: "#cccccc", label: "Complete" },
  ];

  function handlePrint() {
    const [fy, fm] = parseYM(printFrom);
    const [ty, tm] = parseYM(printTo);
    const numMonths = Math.max(1, (ty - fy) * 12 + (tm - fm));
    const CM = Math.max(30, Math.floor(1196 / numMonths));
    const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function moOff(y: number, m: number) { return (y - fy) * 12 + (m - fm); }

    const pSpans: { year: number; span: number }[] = [];
    let pc = 0;
    while (pc < numMonths) {
      const a = fm - 1 + pc;
      const yr = fy + Math.floor(a / 12);
      const mi = a % 12;
      const sp = Math.min(12 - mi, numMonths - pc);
      pSpans.push({ year: yr, span: sp });
      pc += sp;
    }

    const locs = [...new Set(projects.map((p: Project) => p.location))];
    let rows = "";

    let yc = "";
    yc += "<th style=\"width:200px;background:#1a1a1a;color:#c9a84c;font-size:9px;font-weight:700;padding:8px 12px;text-align:left;text-transform:uppercase\">Property</th>";
    yc += "<th style=\"width:96px;background:#1a1a1a;color:#c9a84c;font-size:9px;font-weight:700;padding:8px 12px;text-align:left;text-transform:uppercase\">Status</th>";
    yc += "<th style=\"width:108px;background:#1a1a1a;color:#c9a84c;font-size:9px;font-weight:700;padding:8px 12px;text-align:left;text-transform:uppercase\">Due</th>";
    pSpans.forEach(({ year, span }) => {
      yc += "<th colspan=\"" + span + "\" style=\"background:#1a1a1a;color:#c9a84c;font-size:9px;font-weight:700;padding:8px 4px;text-align:center;border-left:1px solid #333\">" + year + "</th>";
    });
    rows += "<tr>" + yc + "</tr>";

    let mc = "";
    mc += "<th style=\"background:#222;padding:5px 8px\"></th>";
    mc += "<th style=\"background:#222;padding:5px 8px\"></th>";
    mc += "<th style=\"background:#222;padding:5px 8px\"></th>";
    for (let i = 0; i < numMonths; i++) {
      const a = fm - 1 + i;
      const mIdx = a % 12;
      const isNow = fy + Math.floor(a / 12) === CSY && mIdx === CSM - 1;
      const bg = isNow ? "#c9a84c" : "#222";
      const col = isNow ? "#111" : "#666";
      const fw = isNow ? 700 : 500;
      mc += "<th style=\"background:" + bg + ";color:" + col + ";font-size:9px;padding:5px 2px;text-align:center;font-weight:" + fw + "\">" + MN[mIdx] + "</th>";
    }
    rows += "<tr>" + mc + "</tr>";

    const CLRS: Record<string, { bar: string; pill: string; pillText: string }> = {
      construction: { bar: "#a8c8e8", pill: "#d0e8f8", pillText: "#0d4270" },
      install:      { bar: "#a8d8b8", pill: "#cdf0e0", pillText: "#0d5236" },
      maintenance:  { bar: "#f0cc88", pill: "#fde9c8", pillText: "#7a4a08" },
      design:       { bar: "#c8b8e8", pill: "#e6e0fa", pillText: "#3a2880" },
      complete:     { bar: "#cccccc", pill: "#e8e8e8", pillText: "#444" },
    };
    const TL: Record<string, string> = {
      construction: "Construction", install: "Install",
      maintenance: "Maintenance", design: "Design", complete: "Complete",
    };

    locs.forEach((loc: string) => {
      rows += "<tr><td colspan=\"" + (3 + numMonths) + "\" style=\"background:#222;color:#c9a84c;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;padding:6px 12px;border-top:1px solid #333\">" + loc + "</td></tr>";

      projects.filter((p: Project) => p.location === loc).forEach((proj: Project) => {
        const due = getDue(proj, fy, fm);
        const c = CLRS[proj.status] || CLRS.complete;
        const multi = proj.phases.length > 1;
        const ROW_H = 38, PAD = 3;
        const FH = ROW_H - PAD * 2;
        const HH = Math.floor(FH / 2) - 1;

        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + (numMonths * CM) + "\" height=\"" + ROW_H + "\" style=\"display:block;overflow:visible\">";
        proj.phases.forEach((ph: Phase, idx: number) => {
          const s = moOff(ph.start[0], ph.start[1]);
          const e = moOff(ph.end[0], ph.end[1]);
          const cs = Math.max(0, s);
          const ce = Math.min(numMonths, e);
          if (ce <= cs) return;
          const bc = CLRS[ph.type] || CLRS.complete;
          const lane = idx % 2;
          const barH = multi ? HH : FH;
          const barTop = multi ? (lane === 0 ? PAD : PAD + HH + 2) : PAD;
          const bx = cs * CM + 2;
          const bw = (ce - cs) * CM - 4;
          const lblY = barTop + Math.floor(barH / 2) + 4;
          const maxC = Math.floor((bw - 8) / 5.5);
          const lbl = ph.label.length > maxC ? ph.label.substring(0, maxC - 1) + "..." : ph.label;
          svg += "<rect x=\"" + bx + "\" y=\"" + barTop + "\" width=\"" + bw + "\" height=\"" + barH + "\" rx=\"3\" fill=\"" + bc.bar + "\"/>";
          if (bw > 20) {
            svg += "<text x=\"" + (bx + 6) + "\" y=\"" + lblY + "\" font-family=\"Arial\" font-size=\"9\" font-weight=\"700\" fill=\"#1a1a1a\">" + lbl + "</text>";
          }
        });
        svg += "</svg>";

        const dueHtml = due
          ? "<div style=\"font-size:10px;font-weight:700;color:#1a2e44\">" + due.label + "</div><div style=\"font-size:9px;color:#999\">" + due.desc + "</div>"
          : "";

        rows += "<tr style=\"border-bottom:1px solid #e8e3da\">";
        rows += "<td style=\"padding:4px 12px;font-size:10px;font-weight:500;color:#222;background:#fbfbfb;border-right:1px solid #ddd\">" + proj.property + "</td>";
        rows += "<td style=\"padding:3px 8px;text-align:center;background:#fafaf8;border-right:1px solid #ddd\"><span style=\"display:inline-block;font-size:8px;font-weight:700;padding:2px 7px;border-radius:3px;background:" + c.pill + ";color:" + c.pillText + ";text-transform:uppercase\">" + (TL[proj.status] || proj.status) + "</span></td>";
        rows += "<td style=\"padding:3px 10px;background:#fff;border-right:1px solid #ddd\">" + dueHtml + "</td>";
        rows += "<td colspan=\"" + numMonths + "\" style=\"padding:0\">" + svg + "</td>";
        rows += "</tr>";
      });
    });

    const leg = [
      { color: "#a8c8e8", label: "Construction" },
      { color: "#a8d8b8", label: "Install / Fit-out" },
      { color: "#f0cc88", label: "Maintenance" },
      { color: "#c8b8e8", label: "Design / Planning" },
      { color: "#cccccc", label: "Complete" },
    ].map(x =>
      "<span style=\"display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#333;margin-right:16px\">" +
      "<span style=\"display:inline-block;width:12px;height:12px;border-radius:2px;background:" + x.color + "\"></span>" +
      x.label + "</span>"
    ).join("");

    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const titleStr = "Property Portfolio — " + MN[fm - 1] + " " + fy + " to " + MN[tm - 1] + " " + ty;

    let html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>Construction Timeline</title>";
    html += "<style>";
    html += "*{box-sizing:border-box;margin:0;padding:0}";
    html += "body{font-family:Arial,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}";
    html += "@page{size:A3 landscape;margin:8mm}";
    html += ".tip{background:#1a2e44;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;border-radius:6px}";
    html += ".tip p{font-size:11px;color:#aac4e0;margin:0}";
    html += ".tip button{background:#c9a84c;color:#111;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:700}";
    html += "@media print{.tip{display:none!important}}";
    html += "table{border-collapse:collapse;width:100%}";
    html += "</style></head><body>";
    html += "<div class=\"tip\">";
    html += "<div><div style=\"font-size:13px;font-weight:700;margin-bottom:2px\">" + titleStr + "</div>";
    html += "<p>Paper = A3 &bull; Landscape &bull; Minimum margins &bull; Enable Background graphics</p></div>";
    html += "<button onclick=\"window.print()\">Print / Save as PDF</button>";
    html += "</div>";
    html += "<div style=\"padding:4px\">";
    html += "<div style=\"display:flex;flex-wrap:wrap;padding:8px 4px 10px;border-bottom:1px solid #ddd;margin-bottom:6px\">" + leg;
    html += "<span style=\"margin-left:auto;font-size:10px;color:#999\">As of " + dateStr + "</span></div>";
    html += "<table><tbody>" + rows + "</tbody></table>";
    html += "</div></body></html>";

    const pw = window.open("", "_blank", "width=1500,height=900");
    if (pw) {
      pw.document.write(html);
      pw.document.close();
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", fontSize: 12, background: "transparent", minHeight: "100vh", color: "#1a1a1a" }}>
      {/* LEGEND */}
      <div style={{ background: "#fff", padding: "10px 24px", borderBottom: "1px solid #e8e3da", display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        {(legendItems).map(({ color, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#444", fontWeight: 500 }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: color, border: "1px solid rgba(0,0,0,0.12)", flexShrink: 0, display: "inline-block" }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#aaa", letterSpacing: ".3px" }}>{isLoadingBoard ? "Loading timeline..." : "Click any project name to edit"}</span>
      </div>

      {/* DATE RANGE CONTROLS */}
      <div style={{ background: "#fff", padding: "10px 24px", borderBottom: "1px solid #e8e3da", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".6px" }}>View</span>
        <input type="month" value={fmtYM(viewFrom[0], viewFrom[1])}
          onChange={(e) => { const v = parseYM(e.target.value); setViewFrom(v); }}
          style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 5, fontSize: 11, fontFamily: "inherit", background: "#fff", color: "#1a1a1a" }} />
        <span style={{ color: "#aaa", fontSize: 12 }}>→</span>
        <input type="month" value={fmtYM(viewTo[0], viewTo[1])}
          onChange={(e) => { const v = parseYM(e.target.value); setViewTo(v); }}
          style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 5, fontSize: 11, fontFamily: "inherit", background: "#fff", color: "#1a1a1a" }} />
        <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
          {[12, 24, 36].map((m) => {
            const active = viewMonths === m;
            return (
              <button key={m} onClick={() => { setViewFrom([CSY, CSM]); const d = new Date(CSY, CSM-1+m, 1); setViewTo([d.getFullYear(), d.getMonth()+1]); }}
                style={{ padding: "4px 10px", border: `1px solid ${active ? "#1a1a1a" : "#ddd"}`, borderRadius: 5, background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : "#555", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
                {m}m
              </button>
            );
          })}
        </div>
        <button onClick={handlePrint}
          style={{ marginLeft: "auto", padding: "4px 10px", border: "1px solid #c9a84c", borderRadius: 5, background: "#c9a84c", color: "#111", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
          Export PDF
        </button>
        <button onClick={() => {
          const shareUrl = `${window.location.origin}/share/timeline/ronin-public-timeline-share-v1`;
          navigator.clipboard.writeText(shareUrl).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          });
        }}
          style={{ padding: "4px 10px", border: "1px solid #c9a84c", borderRadius: 5, background: "#c9a84c", color: "#111", cursor: "pointer", fontSize: 10, fontWeight: 600, fontFamily: "inherit" }}>
          {linkCopied ? "Link Copied!" : "Share Link"}
        </button>
      </div>

      <div style={{ padding: "20px 24px", background: "transparent" }}>
        {/* EDITOR PANEL */}
        {editingId !== null && (
          <div ref={editorRef} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0dbd2", marginBottom: 20, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <div style={{ background: "#222", color: "#c9a84c", padding: "12px 16px", fontSize: 11, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid #2a2a2a" }}>
              <span>Editing: {editorProp} — {editorLoc}</span>
              <button onClick={() => setEditingId(null)} style={{ background: "transparent", border: "1px solid #444", color: "#aaa", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>✕ Close</button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 18 }}>
                {([
                  { label: "City / Location", content: <input style={inputStyle} value={editorLoc} onChange={(e) => setEditorLoc(e.target.value)} /> },
                  { label: "Property Name",   content: <input style={inputStyle} value={editorProp} onChange={(e) => setEditorProp(e.target.value)} /> },
                  { label: "Status", content: (
                    <select style={inputStyle} value={editorStatus} onChange={(e) => setEditorStatus(e.target.value as Project["status"])}>
                      {(["construction","install","maintenance","design","complete"] as const).map(t => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  )},
                ]).map(({ label, content }: { label: string; content: React.ReactNode }) => (
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
                <button onClick={saveProject} disabled={isSavingBoard} style={{ padding: "7px 20px", borderRadius: 6, border: "none", background: "#c9a84c", color: "#111", cursor: isSavingBoard ? "default" : "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", letterSpacing: ".3px", opacity: isSavingBoard ? 0.7 : 1 }}>{isSavingBoard ? "Saving..." : "✓ Save Changes"}</button>
                <button onClick={deleteProject} disabled={isSavingBoard} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #3a2a2a", background: "transparent", color: "#e05555", cursor: isSavingBoard ? "default" : "pointer", fontSize: 11, fontFamily: "inherit", opacity: isSavingBoard ? 0.7 : 1 }}>Delete</button>
                <button onClick={() => setEditingId(null)} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #ccc", background: "transparent", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* GANTT TABLE */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e0dbd2", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 124 }} />
              <col style={{ width: 108 }} />
              {Array.from({ length: viewMonths }, (_, i) => <col key={i} style={{ minWidth: 38 }} />)}
            </colgroup>
            <thead>
              <tr>
                {["Property", "Status", "Due / Milestone"].map((h) => (
                  <th key={h} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "9px 14px", textAlign: "left", letterSpacing: "1px", textTransform: "uppercase", borderBottom: "1px solid #2a2a2a" }}>{h}</th>
                ))}
                {yearSpans.map(({ year, span }, i) => (
                  <th key={i} colSpan={span} style={{ background: "#1a1a1a", color: "#c9a84c", fontSize: 10, fontWeight: 700, padding: "9px 4px", textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.1)", letterSpacing: "1px" }}>{year}</th>
                ))}
              </tr>
              <tr>
                {["", "", ""].map((_, i) => (
                  <th key={i} style={{ background: "#222", padding: "5px 8px", borderRight: "1px solid #2a2a2a" }} />
                ))}
                {Array.from({ length: viewMonths }, (_, i) => {
                  const absM = viewFrom[1] - 1 + i;
                  const mIdx = absM % 12;
                  const isToday = viewFrom[0] === CSY && viewFrom[1] === CSM && i === 0;
                  return (
                    <th key={i} style={{ background: isToday ? "#c9a84c" : "#222", color: isToday ? "#111" : "#666", fontSize: 10, padding: "5px 2px", textAlign: "center", borderRight: "1px solid #2a2a2a", fontWeight: isToday ? 700 : 500 }}>
                      {MONTHS[mIdx]}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <React.Fragment key={loc}>
                  <tr>
                    <td colSpan={3 + viewMonths} style={{ background: "#222", color: "#c9a84c", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", padding: "7px 14px", borderBottom: "1px solid #2a2a2a", borderTop: "1px solid #2a2a2a" }}>
                      {loc}
                    </td>
                  </tr>
                  {projects.filter((p) => p.location === loc).map((proj) => {
                    const due = getDue(proj, viewFrom[0], viewFrom[1]);
                    const c = COLORS[proj.status] || COLORS.complete;
                    return (
                      <tr key={proj.id} style={{ borderBottom: "1px solid #ede8e0" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf6f0"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                        <td onClick={() => openEditor(proj.id)} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 500, color: "#222", background: "#fbfbfb", borderRight: "1px solid #ddd", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle", height: 44 }}>
                          {proj.property} <span style={{ fontSize: 9, color: "#bbb" }}>✏</span>
                        </td>
                        <td style={{ padding: "4px 10px", textAlign: "center", background: "#fafaf8", borderRight: "1px solid #ede8e0", verticalAlign: "middle" }}>
                          <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 4, background: c.pill, color: c.pillText, textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap" }}>
                            {TYPE_LABEL[proj.status]}
                          </span>
                        </td>
                        <td style={{ padding: "4px 14px 4px 12px", background: "#fff", borderRight: "1px solid #ede8e0", verticalAlign: "middle" }}>
                          {due && (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a2e44", lineHeight: 1.4, marginBottom: 2 }}>{due.label}</div>
                              <div style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>{due.desc}</div>
                            </>
                          )}
                        </td>
                        <td colSpan={viewMonths} style={{ padding: 0, overflow: "visible", verticalAlign: "middle" }}>
                          <BarCanvas proj={proj} csy={viewFrom[0]} csm={viewFrom[1]} totalMonths={viewMonths} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr onClick={() => { if (!isSavingBoard) addProject(loc); }}
                    style={{ cursor: isSavingBoard ? "default" : "pointer", background: "#fafaf8" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f0f7ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafaf8"; }}>
                    <td colSpan={3 + viewMonths} style={{ padding: "6px 14px", color: "#aaa", fontSize: 10, fontWeight: 500, letterSpacing: ".3px", borderBottom: "1px solid #ede8e0" }}>
                      + Add project in {loc}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRINT MODAL */}
      {showPrintModal && (
        <div style={{ display: "flex", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPrintModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "28px 32px", width: 460, maxWidth: "95vw", border: "1px solid #e0dbd2", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a2e44", marginBottom: 6, letterSpacing: ".5px", textTransform: "uppercase" }}>Print / Export to PDF</h2>
            <p style={{ fontSize: 11, color: "#666", marginBottom: 18, lineHeight: 1.5 }}>Choose a date range — fewer months gives wider columns and cleaner text.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              {([{ label: "From", val: printFrom, set: setPrintFrom }, { label: "To", val: printTo, set: setPrintTo }]).map(({ label, val, set }: { label: string; val: string; set: (v: string) => void }) => (
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
            <div style={{ background: "#f5f0e8", borderRadius: 6, padding: "12px 14px", fontSize: 11, color: "#555", marginBottom: 20, lineHeight: 1.8, border: "1px solid #e0dbd2" }}>
              <strong>In the print dialog:</strong><br />
              Paper → <strong>A3</strong> &bull; Orientation → <strong>Landscape</strong><br />
              Margins → <strong>Minimum</strong> &bull; Enable <strong>Background graphics</strong>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowPrintModal(false)}
                style={{ padding: "8px 18px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => { handlePrint(); setShowPrintModal(false); }}
                style={{ padding: "8px 22px", border: "none", borderRadius: 6, background: "#c9a84c", color: "#111", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", letterSpacing: ".3px" }}>
                Open Print Preview →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
