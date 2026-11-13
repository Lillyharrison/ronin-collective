import { describe, it, expect } from "vitest";
import { safeEqual, isInternalToken, isServiceBearer, bearerOf } from "../../supabase/functions/_shared/internalAuthCore";

describe("internal function auth", () => {
  it("accepts a matching internal token", () => { expect(isInternalToken("tok-123", "tok-123")).toBe(true); });
  it("rejects a wrong or missing internal token", () => {
    expect(isInternalToken("tok-124", "tok-123")).toBe(false);
    expect(isInternalToken("tok-12", "tok-123")).toBe(false);
    expect(isInternalToken(null, "tok-123")).toBe(false);
    expect(isInternalToken("", "tok-123")).toBe(false);
  });
  it("rejects everything when no token is stored", () => { expect(isInternalToken("x", null)).toBe(false); expect(isInternalToken(null, null)).toBe(false); });
  it("accepts the service key only as Bearer", () => {
    expect(isServiceBearer("Bearer svc", "svc")).toBe(true);
    expect(isServiceBearer("svc", "svc")).toBe(false);
    expect(isServiceBearer("Bearer anon", "svc")).toBe(false);
    expect(isServiceBearer(null, "svc")).toBe(false);
    expect(isServiceBearer("Bearer svc", undefined)).toBe(false);
  });
  it("parses bearer tokens", () => { expect(bearerOf("Bearer  abc ")).toBe("abc"); expect(bearerOf("Bearer ")).toBe(null); });
  it("safeEqual is exact", () => { expect(safeEqual("ab", "abc")).toBe(false); expect(safeEqual("abc", "abc")).toBe(true); });
});
