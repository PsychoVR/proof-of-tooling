import { describe, expect, it } from "vitest";
import { base58Length, buildClaimMessage, mockCheckClaim, validateIdentity, validateToolUrl } from "@/lib/ui/claim";
import { formatStake, safeHttpUrl } from "@/lib/ui/format";

describe("ui helpers", () => {
  it("only accepts plain http(s) urls", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("formats lamports without float loss", () => {
    expect(formatStake("900000000000000")).toBe("900,000 SOL");
    expect(formatStake("abc")).toBe("n/a");
  });

  it("decodes base58 lengths", () => {
    expect(base58Length("0OIl")).toBeNull();
    expect(base58Length("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB")).toBe(32);
    expect(base58Length("11111111111111111111111111111111")).toBe(32);
  });

  it("rejects values that could break out of the shell command", () => {
    expect(validateToolUrl('github.com/a/b" ; rm -rf ~ #')).not.toBeNull();
    expect(validateToolUrl("github.com/a/b")).toBeNull();
    expect(validateIdentity("nope")).not.toBeNull();
    expect(validateIdentity("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB")).toBeNull();
  });

  it("builds the v1 claim line and mock-checks the signature shape", () => {
    const msg = buildClaimMessage("https://github.com/a/b/", "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB", "2026-10-07");
    expect(msg).toBe("proof-of-tooling v1 | claim | github.com/a/b | GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB | 2026-10-07");
    expect(mockCheckClaim({ message: msg, signature: "short" }).ok).toBe(false);
  });
});

import { toolPillStatus } from "@/lib/ui/format";

describe("toolPillStatus", () => {
  const t = (status: "claimed" | "unclaimed", claims: { status: string; identity: string }[]) => ({ status, claims });
  it("shows signed, in review or unclaimed", () => {
    expect(toolPillStatus(t("claimed", []))).toBe("claimed");
    expect(toolPillStatus(t("unclaimed", [{ status: "pending", identity: "A" }]))).toBe("pending");
    expect(toolPillStatus(t("unclaimed", [{ status: "pending", identity: "A" }]), "B")).toBe("unclaimed");
    expect(toolPillStatus(t("unclaimed", [{ status: "stale", identity: "A" }]))).toBe("unclaimed");
  });
});
