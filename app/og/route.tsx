import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getStats } from "@/lib/queries";
import { OG_CACHE_CONTROL, OG_FALLBACK_CACHE_CONTROL, OG_HEIGHT, OG_MEMO_MS, OG_WIDTH, odometerDigits } from "@/lib/og";
import { SITE_NAME, TAGLINE } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Colours and type follow the dark theme of the design prototype (tokens), so the card matches the site.
const C = { bg: "#0f1514", surface: "#151d1b", line: "#26332f", fg: "#e7ecea", muted: "#8fa09a", accent: "#f2b544", digitBg: "#0a0e0d", digitFg: "#f6c35a", accentInk: "#1a1204" };

// Font files live in the repository (assets/fonts, OFL): nothing is downloaded at build or run time.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const fonts = (() => {
  let cached: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[]> | undefined;
  return () =>
    (cached ??= Promise.all([
      readFile(path.join(FONT_DIR, "BigShoulders-800.woff")),
      readFile(path.join(FONT_DIR, "HankenGrotesk-500.woff")),
      readFile(path.join(FONT_DIR, "HankenGrotesk-700.woff")),
      readFile(path.join(FONT_DIR, "JetBrainsMono-500.woff")),
    ]).then(([display, body500, body700, mono]) => [
      { name: "Display", data: display, weight: 800 as const, style: "normal" as const },
      { name: "Body", data: body500, weight: 500 as const, style: "normal" as const },
      { name: "Body", data: body700, weight: 700 as const, style: "normal" as const },
      { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
    ]));
})();

type Counters = { tools: number; validators: number } | null;

let memo: { at: number; body: ArrayBuffer; counters: Counters } | undefined;

async function render(counters: Counters): Promise<ArrayBuffer> {
  const digits = counters ? odometerDigits(counters.tools) : null;
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, color: C.fg, padding: 56, fontFamily: "Body" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 26 26">
            <rect x="1" y="1" width="24" height="24" rx="5" fill={C.accent} />
            <path d="M7 7v12M11 7v12M15 7v12M19 7v12M5 17L21 9" stroke={C.accentInk} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </svg>
          <div style={{ fontFamily: "Display", fontWeight: 800, fontSize: 40, letterSpacing: 1, textTransform: "uppercase" }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontFamily: "Display", fontWeight: 800, fontSize: 58, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: 0.5, maxWidth: 1088 }}>{TAGLINE}</div>
          {digits ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              {digits.map((d, i) => (
                <div key={i} style={{ width: 88, height: 124, display: "flex", alignItems: "center", justifyContent: "center", background: C.digitBg, borderRadius: 8, border: `1px solid ${C.line}`, color: C.digitFg, fontFamily: "Display", fontWeight: 800, fontSize: 104 }}>
                  {d}
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 14, paddingBottom: 6 }}>
                <div style={{ fontFamily: "Display", fontWeight: 800, fontSize: 34, textTransform: "uppercase", letterSpacing: 1 }}>tools</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: C.muted, textTransform: "uppercase", letterSpacing: 2 }}>built by validators</div>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.line}`, paddingTop: 22, fontFamily: "Mono", fontWeight: 500, fontSize: 24, color: C.muted }}>
          <div style={{ display: "flex" }}>{counters ? `${counters.validators} validators tracked` : "Solana validators"}</div>
          <div style={{ display: "flex", color: C.accent }}>tooling.sunshinevr.io</div>
        </div>
      </div>
    ),
    { width: OG_WIDTH, height: OG_HEIGHT, fonts: await fonts() },
  );
  return image.arrayBuffer();
}

function png(body: ArrayBuffer, cacheControl: string) {
  return new Response(body, { headers: { "content-type": "image/png", "cache-control": cacheControl } });
}

/** Social preview of the home page with the live counters. Rendered once per 10 minutes per process. */
export async function GET() {
  if (memo && Date.now() - memo.at < OG_MEMO_MS) return png(memo.body, OG_CACHE_CONTROL);
  let counters: Counters = null;
  try {
    const stats = await getStats();
    counters = { tools: stats.toolsTotal, validators: stats.validatorsTotal };
  } catch {
    console.warn("social image: stats unavailable, rendering without counters");
  }
  try {
    const body = await render(counters);
    if (!counters) return png(body, OG_FALLBACK_CACHE_CONTROL);
    memo = { at: Date.now(), body, counters };
    return png(body, OG_CACHE_CONTROL);
  } catch (err) {
    console.error("social image failed:", err instanceof Error ? err.message : "unknown error");
    if (memo) return png(memo.body, OG_FALLBACK_CACHE_CONTROL); // stale beats nothing
    return new Response("unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  }
}
