import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Property } from "./types";

export function StaffFilterBar({
  filterSearch,
  setFilterSearch,
  filterDepartment,
  setFilterDepartment,
  filterProperty,
  setFilterProperty,
  departmentOptions,
  properties,
  filtersActive,
  staffCount,
  onClear,
}: {
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  filterDepartment: string;
  setFilterDepartment: (v: string) => void;
  filterProperty: string;
  setFilterProperty: (v: string) => void;
  departmentOptions: string[];
  properties: Property[];
  filtersActive: boolean;
  staffCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        value={filterSearch}
        onChange={(e) => setFilterSearch(e.target.value)}
        placeholder="Search staff…"
        className="h-8 text-xs w-44"
      />
      <Select value={filterDepartment} onValueChange={setFilterDepartment}>
        <SelectTrigger className="h-8 text-xs w-40">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {departmentOptions.map((d) => (
            <SelectItem key={d} value={d}>{d}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filterProperty} onValueChange={setFilterProperty}>
        <SelectTrigger className="h-8 text-xs w-44">
          <SelectValue placeholder="Property" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All properties</SelectItem>
          {properties.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filtersActive && (
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onClear}>
          <X size={13} /> Clear
        </Button>
      )}
      <span className="text-[11px] text-muted-foreground ml-auto">
        {staffCount} {staffCount === 1 ? "person" : "people"}
      </span>
    </div>
  );
}
