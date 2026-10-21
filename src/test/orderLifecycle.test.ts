import { describe, expect, it } from "vitest";
import { orderStage } from "@/lib/orderLifecycle";

describe("shopping request lifecycle", () => {
  it("keeps sent requests awaiting manager placement", () => {
    expect(orderStage("not_placed")).toBe("not_placed");
  });
  it("keeps placed requests visible until delivery", () => {
    expect(orderStage("placed")).toBe("placed");
    expect(orderStage("pending_delivery")).toBe("placed");
  });
  it("only treats confirmed deliveries as delivered", () => {
    expect(orderStage("delivered")).toBe("delivered");
  });
});