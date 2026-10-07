import { describe, expect, it } from "vitest";
import { clip, DEFAULT_DESCRIPTION, OG_IMAGE, pageMetadata, TWITTER_HANDLE } from "@/lib/seo";
import { odometerDigits } from "@/lib/og";

describe("pageMetadata", () => {
  it("carries title, description, canonical, Open Graph and a large Twitter card", () => {
    const m = pageMetadata({ title: "Registry", description: "All claims.", path: "/registry" });
    expect(m.title).toBe("Registry");
    expect(m.description).toBe("All claims.");
    expect(m.alternates).toEqual({ canonical: "/registry" });
    expect(m.openGraph).toMatchObject({ type: "website", siteName: "Proof of Tooling", title: "Registry | Proof of Tooling", url: "/registry", images: [OG_IMAGE] });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", site: TWITTER_HANDLE, title: "Registry | Proof of Tooling", images: [{ url: "/og.png", alt: OG_IMAGE.alt }] });
    expect(TWITTER_HANDLE).toBe("@proofoftooling");
  });

  it("the home page keeps the plain site name and the default description", () => {
    const m = pageMetadata({ path: "/" });
    expect(m).not.toHaveProperty("title");
    expect(m.description).toBe(DEFAULT_DESCRIPTION);
    expect(m.openGraph).toMatchObject({ title: "Proof of Tooling" });
  });

  it("without a path there is no canonical or og:url (layout default for errors and 404)", () => {
    const m = pageMetadata({});
    expect(m).not.toHaveProperty("alternates");
    expect(m.openGraph).not.toHaveProperty("url");
  });

  it("the shared image is 1200x630 with alt text", () => {
    expect(OG_IMAGE).toMatchObject({ url: "/og.png", type: "image/png", width: 1200, height: 630 });
    expect(OG_IMAGE.alt.length).toBeGreaterThan(10);
  });
});

describe("clip", () => {
  it("collapses whitespace and shortens long text with an ellipsis", () => {
    expect(clip("  a \n b  ")).toBe("a b");
    const long = clip("x".repeat(500), 50);
    expect(long).toHaveLength(50);
    expect(long.endsWith("…")).toBe(true);
    expect(clip("short", 50)).toBe("short");
  });
});

describe("odometerDigits", () => {
  it("pads to four digits and never goes negative", () => {
    expect(odometerDigits(27)).toEqual(["0", "0", "2", "7"]);
    expect(odometerDigits(12345)).toEqual(["1", "2", "3", "4", "5"]);
    expect(odometerDigits(-3)).toEqual(["0", "0", "0", "0"]);
    expect(odometerDigits(Number.NaN)).toEqual(["0", "0", "0", "0"]);
    expect(odometerDigits(9.9)).toEqual(["0", "0", "0", "9"]);
  });
});
