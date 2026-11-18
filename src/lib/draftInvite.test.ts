import { describe, it, expect } from "vitest";
import { draftFlagForProfileUpdate } from "../../supabase/functions/ronin-ai/draftInvite";

describe("draft invitation profile flag", () => {
  it("keeps the profile a draft while an invitation is being sent so activation can find it", () => {
    expect(draftFlagForProfileUpdate(true, true)).toBe(true);
  });
  it("saving without inviting keeps the draft", () => {
    expect(draftFlagForProfileUpdate(false, false)).toBe(true);
  });
  it("send_invitation without email details still promotes as before", () => {
    expect(draftFlagForProfileUpdate(true, false)).toBe(false);
  });
});
