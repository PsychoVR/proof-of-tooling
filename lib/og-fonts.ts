import { readFile } from "node:fs/promises";
import path from "node:path";

// Font files live in the repository (assets/fonts, OFL): nothing is downloaded at build or run time.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
export const fonts = (() => {
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
