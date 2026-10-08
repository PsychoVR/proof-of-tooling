import { describe, expect, it } from "vitest";
import { parseWizardState, reconcileWizardDate, serializeWizardState, type WizardState } from "@/lib/ui/claim";

const base: WizardState = {
  step: 2, name: "Tool", url: "github.com/a/b", category: "Meta",
  identity: "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB", date: "2026-10-07", signature: "sig",
};
const now = new Date("2026-10-07T12:00:00Z");

describe("wizard state storage", () => {
  it("round-trips a valid state", () => {
    expect(parseWizardState(serializeWizardState(base))).toEqual(base);
  });

  it.each([null, "", "not json", "null", "[]", '"x"', JSON.stringify({ ...base, date: "2026-13-40" }), JSON.stringify({ ...base, date: 5 })])(
    "drops malformed input %j",
    (raw) => expect(parseWizardState(raw)).toBeNull(),
  );

  it("sanitizes fields instead of trusting them", () => {
    const s = parseWizardState(JSON.stringify({ ...base, step: 9, category: "Nope", name: 4, url: "x".repeat(500) }))!;
    expect(s.step).toBe(0);
    expect(s.category).toBe("");
    expect(s.name).toBe("");
    expect(s.url).toHaveLength(300);
    expect(parseWizardState(JSON.stringify({ ...base, step: 1 }))!.step).toBe(1);
  });
});

describe("reconcileWizardDate", () => {
  it("keeps a message dated within the accepted window", () => {
    expect(reconcileWizardDate({ ...base, date: "2026-10-01" }, now)).toEqual({ state: { ...base, date: "2026-10-01" }, regenerated: false });
  });

  it("regenerates a stale date, clears the signature and returns to signing", () => {
    const r = reconcileWizardDate({ ...base, date: "2026-09-20" }, now);
    expect(r.regenerated).toBe(true);
    expect(r.state).toMatchObject({ date: "2026-10-07", signature: "", step: 1 });
  });

  it("also regenerates a future date and leaves earlier steps where they are", () => {
    const r = reconcileWizardDate({ ...base, step: 0, date: "2026-12-01" }, now);
    expect(r.regenerated).toBe(true);
    expect(r.state.step).toBe(0);
  });
});
