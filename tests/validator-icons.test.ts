import { describe, expect, it, vi } from "vitest";
import { refreshIconFor, runIcons, type IconDeps, type IconTarget } from "@/jobs/icons";
import { iconEtag, iconPath, MAX_ICON_BYTES, sniffIconType } from "@/lib/validator-icons";
import { buildToolsWithClaims, mapValidator, type ValidatorRow } from "@/lib/query-mappers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("sniffIconType", () => {
  it("accepts png, jpeg, gif and webp by their bytes", () => {
    expect(sniffIconType(PNG)).toBe("image/png");
    expect(sniffIconType(JPEG)).toBe("image/jpeg");
    expect(sniffIconType(GIF)).toBe("image/gif");
    expect(sniffIconType(WEBP)).toBe("image/webp");
  });

  it("refuses svg, html, text, truncated signatures and empty input", () => {
    expect(sniffIconType(SVG)).toBeNull();
    expect(sniffIconType(Buffer.from("<!doctype html><html></html>"))).toBeNull();
    expect(sniffIconType(Buffer.from("hello"))).toBeNull();
    expect(sniffIconType(PNG.subarray(0, 7))).toBeNull();
    expect(sniffIconType(Buffer.alloc(0))).toBeNull();
    // A RIFF container that is not WebP (a WAV file).
    expect(sniffIconType(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WAVEfmt ")]))).toBeNull();
  });
});

describe("iconEtag", () => {
  it("is quoted, stable and changes with the bytes", () => {
    expect(iconEtag(PNG)).toMatch(/^"[0-9a-f]{32}"$/);
    expect(iconEtag(PNG)).toBe(iconEtag(Buffer.from(PNG)));
    expect(iconEtag(PNG)).not.toBe(iconEtag(JPEG));
  });

  it("limit is 500 KB", () => expect(MAX_ICON_BYTES).toBe(512_000));
});

function deps(targets: IconTarget[], fetchIcon: IconDeps["fetchIcon"], stored: string[] = []) {
  const saved: Record<string, { contentType: string; etag: string }> = {};
  const remove = vi.fn(async ({ keep, also }: { keep: string[]; also: string[] }) => stored.filter((id) => !keep.includes(id) || also.includes(id)).length);
  const d: IconDeps = {
    targets: async () => targets,
    iconUrlOf: async (id) => targets.find((x) => x.identity === id)?.iconUrl ?? null,
    fetchIcon,
    save: async (id, icon) => void (saved[id] = { contentType: icon.contentType, etag: icon.etag }),
    remove,
  };
  return { d, saved, remove };
}

describe("runIcons", () => {
  it("saves valid images and decides the type from the bytes, not the url", async () => {
    const { d, saved } = deps([{ identity: "A", iconUrl: "https://a.example/logo.svg" }], async () => ({ status: 200, body: PNG }));
    expect(await runIcons(d)).toMatchObject({ checked: 1, saved: 1, rejected: 0, failed: 0 });
    expect(saved.A).toEqual({ contentType: "image/png", etag: iconEtag(PNG) });
  });

  it("rejects svg and html, and drops any stored icon for them", async () => {
    const { d, saved, remove } = deps(
      [{ identity: "A", iconUrl: "https://a.example/i" }, { identity: "B", iconUrl: "https://b.example/i" }],
      async (u) => ({ status: 200, body: u.includes("a.example") ? SVG : Buffer.from("<html>") }),
      ["A", "B"],
    );
    expect(await runIcons(d)).toMatchObject({ saved: 0, rejected: 2, failed: 0, removed: 2 });
    expect(saved).toEqual({});
    expect(remove).toHaveBeenCalledWith({ keep: ["A", "B"], also: ["A", "B"] });
  });

  it("keeps the stored icon when the fetch fails or answers with an HTTP error; an empty 200 is rejected", async () => {
    const { d, remove } = deps(
      [{ identity: "A", iconUrl: "https://a.example/i" }, { identity: "B", iconUrl: "https://b.example/i" }, { identity: "C", iconUrl: "https://c.example/i" }],
      async (u) => {
        if (u.includes("a.example")) throw new Error("timeout");
        if (u.includes("b.example")) return { status: 503, body: Buffer.from("down") };
        return { status: 200, body: Buffer.alloc(0) };
      },
      ["A", "B", "C"],
    );
    expect(await runIcons(d)).toMatchObject({ saved: 0, failed: 2, rejected: 1 });
    expect(remove).toHaveBeenCalledWith({ keep: ["A", "B", "C"], also: ["C"] });
  });

  it("removes icons of validators that are no longer verified or publish no icon", async () => {
    const { d, remove } = deps([{ identity: "A", iconUrl: "https://a.example/i" }], async () => ({ status: 200, body: JPEG }), ["A", "GONE"]);
    expect((await runIcons(d)).removed).toBe(1);
    expect(remove).toHaveBeenCalledWith({ keep: ["A"], also: [] });
  });

  it("does at most 100 per run and never more than 4 downloads at once", async () => {
    const targets = Array.from({ length: 130 }, (_, i) => ({ identity: `V${i}`, iconUrl: `https://v${i}.example/i` }));
    let active = 0;
    let peak = 0;
    const { d, remove } = deps(targets, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { status: 200, body: PNG };
    });
    expect((await runIcons(d)).checked).toBe(100);
    expect(peak).toBeLessThanOrEqual(4);
    // Validators beyond the cap are still verified, so their stored icons are kept.
    expect((remove.mock.calls[0][0] as { keep: string[] }).keep).toHaveLength(130);
  });
});

const row = (identity: string): ValidatorRow => ({
  id: 1,
  identity,
  cluster: "mainnet",
  voteAccount: "v",
  name: "N",
  website: null,
  iconUrl: "https://evil.example/track.png",
  activatedStake: BigInt(1),
  version: null,
  delinquent: false,
  updatedAt: new Date(),
});

describe("icon exposure", () => {
  it("never exposes the third-party url: only our own path, and only when a copy is stored", () => {
    expect(mapValidator(row("A")).iconUrl).toBeNull();
    expect(mapValidator(row("A"), true).iconUrl).toBe(iconPath("A"));
    expect(iconPath("A")).toBe("/api/validators/A/icon");
  });

  it("claimedBy carries the icon path only for validators with a stored icon", () => {
    const tool = { id: 1, slug: "t", url: "u", name: "T", category: "Meta", kind: "repo", isFork: false, stars: null, lastCommitAt: null, health: "unknown", createdAt: new Date() } as never;
    const claim = (identity: string) =>
      ({ id: 1, toolId: 1, identity, cluster: "mainnet", message: "m", signature: "s", signedDate: "2026-10-06", status: "active", verifiedAt: new Date(), lastCheckedAt: null, failures: 0 }) as never;
    const out = buildToolsWithClaims([tool], [claim("A"), claim("B")], [
      { identity: "A", cluster: "mainnet", name: "Alpha", hasIcon: true },
      { identity: "B", cluster: "mainnet", name: "Bravo" },
    ]);
    expect(out[0].claimedBy.map((c) => c.iconUrl)).toEqual(["/api/validators/A/icon", null]);
  });
});

describe("refreshIconFor (right after a claim becomes active)", () => {
  it("downloads and stores the icon of that validator", async () => {
    const { d, saved } = deps([{ identity: "A", iconUrl: "https://a.example/i.png" }], async () => ({ status: 200, body: PNG }));
    expect(await refreshIconFor("A", d)).toBe("saved");
    expect(saved.A.contentType).toBe("image/png");
  });

  it("does nothing for a validator that publishes no icon", async () => {
    const fetchIcon = vi.fn();
    const { d } = deps([], fetchIcon);
    expect(await refreshIconFor("A", d)).toBeNull();
    expect(fetchIcon).not.toHaveBeenCalled();
  });

  it("rejects non images and reports network or lookup failures without throwing", async () => {
    const t = [{ identity: "A", iconUrl: "https://a.example/i" }];
    expect(await refreshIconFor("A", deps(t, async () => ({ status: 200, body: SVG })).d)).toBe("rejected");
    expect(await refreshIconFor("A", deps(t, async () => ({ status: 500, body: PNG })).d)).toBe("failed");
    expect(await refreshIconFor("A", deps(t, async () => { throw new Error("timeout"); }).d)).toBe("failed");
    const broken = { ...deps(t, async () => ({ status: 200, body: PNG })).d, iconUrlOf: async () => { throw new Error("db down"); } };
    expect(await refreshIconFor("A", broken)).toBeNull();
  });
});
