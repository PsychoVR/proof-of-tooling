/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getStats } from "@/lib/queries";
import { OG_CACHE_CONTROL, OG_FALLBACK_CACHE_CONTROL, OG_HEIGHT, OG_MEMO_MS, OG_WIDTH, odometerDigits } from "@/lib/og";
import { SITE_NAME, TAGLINE } from "@/lib/seo";

export const dynamic = "force-dynamic";

// Colours and type follow the dark theme of the design prototype (tokens), so the card matches the site.
const C = { bg: "#0f1514", surface: "#151d1b", line: "#26332f", fg: "#e7ecea", muted: "#8fa09a", accent: "#00ff8b", digitBg: "#0a0e0d", digitFg: "#14f195", accentInk: "#000" };
const GRAD = "linear-gradient(to top right, #14f195 0%, #22a7bc 50%, #9945ff 100%)";

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

// Small mark for the corner of the card, inlined once as a data URI (the renderer cannot fetch relative URLs).
const logo = (() => {
  let cached: Promise<string> | undefined;
  return () => (cached ??= readFile(path.join(process.cwd(), "public", "brand", "sunshinevr-96.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`));
})();

type Counters = { tools: number; validators: number } | null;

let memo: { at: number; body: ArrayBuffer; counters: Counters } | undefined;

async function render(counters: Counters): Promise<ArrayBuffer> {
  const mark = await logo().catch(() => null);
  const digits = counters ? odometerDigits(counters.tools) : null;
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, color: C.fg, padding: 56, fontFamily: "Body" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 26 26">
            <defs>
              <linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#14f195" />
                <stop offset=".5" stopColor="#22a7bc" />
                <stop offset="1" stopColor="#9945ff" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="24" height="24" rx="5" fill="url(#g)" />
            <path d="M7 7v12M11 7v12M15 7v12M19 7v12M5 17L21 9" stroke={C.accentInk} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </svg>
          <div style={{ fontFamily: "Display", fontWeight: 800, fontSize: 40, letterSpacing: 1, textTransform: "uppercase" }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontFamily: "Display", fontWeight: 800, fontSize: 58, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: 0.5, maxWidth: 1088 }}>{TAGLINE}</div>
          {digits ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              {digits.map((d, i) => (
                <div key={i} style={{ width: 88, height: 124, display: "flex", padding: 2, background: GRAD, borderRadius: 8 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.digitBg, borderRadius: 6, color: C.digitFg, fontFamily: "Display", fontWeight: 800, fontSize: 104 }}>
                    {d}
                  </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: C.accent }}>
            {mark ? (<img src={mark} width={34} height={34} style={{ borderRadius: 8 }} alt="" />) : null}
            tooling.sunshinevr.io
          </div>
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

let inflight: Promise<Response> | undefined;

/** Renders with fresh counters and updates the memo. Concurrent callers share one render. */
function refresh(): Promise<Response> {
  return (inflight ??= (async () => {
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
    } finally {
      inflight = undefined;
    }
  })());
}

/**
 * Social preview of the home page with the live counters. Link-preview crawlers give up after a
 * second or so, so a request never waits for a render when an older image exists: the stale image
 * is served at once and a new one is rendered in the background. Counters may lag by one interval.
 */
export async function GET() {
  if (memo) {
    if (Date.now() - memo.at >= OG_MEMO_MS) void refresh();
    return png(memo.body, OG_CACHE_CONTROL);
  }
  return refresh();
}
