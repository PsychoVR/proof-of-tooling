import { ImageResponse } from "next/og";
import { fonts } from "@/lib/og-fonts";
import { SITE_NAME } from "@/lib/seo";
import { isMonthParam, monthLabel, type TopEntry } from "@/lib/top";
import { getSnapshot } from "@/lib/top-queries";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 675;
// Dark theme tokens of the design prototype, as in the home page card.
const C = { bg: "#0f1514", surface: "#151d1b", line: "#26332f", fg: "#e7ecea", muted: "#8fa09a", accent: "#00ff8b", digitBg: "#0a0e0d", digitFg: "#14f195" };
const GRAD = "linear-gradient(to top right, #14f195 0%, #22a7bc 50%, #9945ff 100%)";

const clipName = (name: string, max: number) => {
  const chars = Array.from(name);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : name;
};

function Digits({ value, size }: { value: number; size: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {Array.from(String(Math.max(0, value)).padStart(2, "0")).map((d, i) => (
        <div key={i} style={{ width: size * 0.66, height: size, display: "flex", padding: 2, background: GRAD, borderRadius: 6 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.digitBg, borderRadius: 4, color: C.digitFg, fontFamily: "Display", fontWeight: 800, fontSize: size * 0.78 }}>{d}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ e, first }: { e: TopEntry; first: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: first ? "26px 14px 24px" : "18px 14px 18px", background: C.surface, border: `2px solid ${first ? C.accent : C.line}`, borderRadius: 14 }}>
      <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: first ? 40 : 32, color: first ? C.accent : C.muted }}>#{e.rank}</div>
      <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: first ? 34 : 28, textTransform: "uppercase", textAlign: "center", lineHeight: 1.05 }}>{clipName(e.name, 20)}</div>
      <Digits value={e.toolCount} size={first ? 72 : 58} />
      <div style={{ display: "flex", fontWeight: 700, fontSize: 16, color: C.muted, textTransform: "uppercase", letterSpacing: 2 }}>{e.toolCount === 1 ? "tool" : "tools"}</div>
    </div>
  );
}

function Row({ e }: { e: TopEntry }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 34, fontSize: 22 }}>
      <div style={{ display: "flex", width: 38, fontFamily: "Display", fontWeight: 800, fontSize: 26, color: C.muted }}>{e.rank}</div>
      <div style={{ display: "flex", flex: 1, fontWeight: 700 }}>{clipName(e.name, 24)}</div>
      <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 28, color: C.digitFg }}>{e.toolCount}</div>
    </div>
  );
}

/** Social image of a frozen month: 1200x675, the card X shows for the snapshot page. Immutable, so cached for long. */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const month = (await params).month;
  const snap = isMonthParam(month) ? await getSnapshot(month) : null;
  if (!snap) return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  const podium = snap.entries.slice(0, 3);
  const rest = snap.entries.slice(3, 10);
  const left = rest.slice(0, 4);
  const right = rest.slice(4);
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, color: C.fg, padding: 40, fontFamily: "Body" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 46, textTransform: "uppercase", letterSpacing: 1 }}>Top tool builders · {monthLabel(month)}</div>
          <div style={{ display: "flex", fontFamily: "Display", fontWeight: 800, fontSize: 28, textTransform: "uppercase", color: C.accent }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          {podium.map((e) => (
            <Card key={e.identity} e={e} first={e.rank === 1} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{left.map((e) => <Row key={e.identity} e={e} />)}</div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{right.map((e) => <Row key={e.identity} e={e} />)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.line}`, paddingTop: 14, fontFamily: "Mono", fontWeight: 500, fontSize: 22, color: C.muted }}>
          <div style={{ display: "flex" }}>{snap.validators} validators with signed tools</div>
          <div style={{ display: "flex", color: C.accent }}>tooling.sunshinevr.io</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: await fonts() },
  );
  const body = await image.arrayBuffer();
  return new Response(body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=604800, immutable" } });
}
