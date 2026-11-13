import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";
import { filterOrdersByHouse, orderCounts, useArrivalHouseFilter, HouseFilterChip } from "./houseFilter";

const orders = [
  { id: "1", property_id: "park", status: "not_placed" },
  { id: "2", property_id: "park", status: "delivered" },
  { id: "3", property_id: "other", status: "placed" },
  { id: "4", property_id: null, status: "placed" },
];

describe("Orders house filter", () => {
  it("reads the arriving house once and clears the global value", () => {
    const clear = vi.fn();
    const { result } = renderHook(() => useArrivalHouseFilter("park", clear));
    expect(result.current[0]).toBe("park");
    expect(clear).toHaveBeenCalledWith(null);
  });

  it("shows the chip when arriving from a house, and both actions clear it", () => {
    const onClear = vi.fn();
    render(<HouseFilterChip houseName="502 Park" isES={false} onClear={onClear} />);
    expect(screen.getByText("Showing 502 Park")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Clear house filter"));
    fireEvent.click(screen.getByText("All houses"));
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it("with no filter shows every order, including ones with no house", () => {
    expect(filterOrdersByHouse(orders, null).map(o => o.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("counts follow the filter", () => {
    const filtered = orderCounts(filterOrdersByHouse(orders, "park"));
    expect([filtered.pending.length, filtered.delivered.length, filtered.notPlaced]).toEqual([1, 1, 1]);
    const all = orderCounts(filterOrdersByHouse(orders, null));
    expect([all.pending.length, all.delivered.length, all.notPlaced]).toEqual([3, 1, 1]);
  });
});
