import { describe, expect, it } from "vitest";
import { isValidPubkey, mergeClaim } from "@/lib/claims";
import type { ClaimStatus } from "@/lib/types";

const STATUSES: ClaimStatus[] = ["active", "pending", "stale", "withdrawn", "rejected"];
const DATES = ["2026-10-06", "2026-10-07", "2026-10-08"];

describe("mergeClaim", () => {
  it("applies when nothing is stored", () => {
    for (const status of STATUSES) expect(mergeClaim(null, { status, signedDate: "2026-10-07" })).toBe("apply");
  });

  it("a rejected claim stays rejected whatever arrives", () => {
    for (const status of STATUSES) for (const signedDate of DATES) {
      expect(mergeClaim({ status: "rejected", signedDate: "2026-10-07" }, { status, signedDate })).toBe("keep");
    }
  });

  it("an older message never replaces a newer one", () => {
    for (const stored of STATUSES.filter((s) => s !== "rejected")) for (const status of STATUSES) {
      expect(mergeClaim({ status: stored, signedDate: "2026-10-07" }, { status, signedDate: "2026-10-06" })).toBe("keep");
    }
  });

  it("on the same day a withdrawal beats a later claim, but not the other way round", () => {
    const withdrawn = { status: "withdrawn" as const, signedDate: "2026-10-07" };
    for (const status of ["active", "pending", "stale"] as const) {
      expect(mergeClaim(withdrawn, { status, signedDate: "2026-10-07" })).toBe("keep");
    }
    expect(mergeClaim(withdrawn, { status: "withdrawn", signedDate: "2026-10-07" })).toBe("apply");
    for (const stored of ["active", "pending", "stale"] as const) {
      expect(mergeClaim({ status: stored, signedDate: "2026-10-07" }, { status: "withdrawn", signedDate: "2026-10-07" })).toBe("apply");
    }
  });

  it("a claim dated after an unclaim re-activates it (claim -> unclaim -> claim)", () => {
    expect(mergeClaim({ status: "withdrawn", signedDate: "2026-10-07" }, { status: "active", signedDate: "2026-10-08" })).toBe("apply");
    expect(mergeClaim({ status: "withdrawn", signedDate: "2026-10-07" }, { status: "pending", signedDate: "2026-10-08" })).toBe("apply");
  });

  it("renewals and newer messages apply for every non-rejected stored state", () => {
    for (const stored of STATUSES.filter((s) => s !== "rejected")) {
      expect(mergeClaim({ status: stored, signedDate: "2026-10-07" }, { status: "active", signedDate: "2026-10-08" })).toBe("apply");
    }
    expect(mergeClaim({ status: "stale", signedDate: "2026-10-07" }, { status: "active", signedDate: "2026-10-07" })).toBe("apply");
    expect(mergeClaim({ status: "active", signedDate: "2026-10-07" }, { status: "active", signedDate: "2026-10-07" })).toBe("apply");
  });
});

describe("isValidPubkey", () => {
  it("accepts base58 for exactly 32 bytes", () => {
    expect(isValidPubkey("21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh")).toBe(true);
    expect(isValidPubkey("11111111111111111111111111111111")).toBe(true);
  });

  it.each(["", "é", "é".repeat(44), "0".repeat(44), "O".repeat(44), "l".repeat(44), "1".repeat(31), "2".repeat(60), "21Czj GL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh"])(
    "rejects %s",
    (s) => expect(isValidPubkey(s)).toBe(false),
  );
});
