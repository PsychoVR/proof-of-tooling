// Fails the build when test-only code or switches ended up in the production bundle.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

if (process.env.E2E_BUILD === "1") process.exit(0);

const FORBIDDEN = ["E2E_NOW", "E2E_CLAIMS_STUB", "E2E_PROOF_IDENTITIES", "claim verification is using the test double"];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* files(p);
    else if (/\.(js|mjs|cjs|json|html|rsc|txt|map)$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of [".next/server", ".next/static"]) {
  try {
    for (const f of files(root)) {
      const text = readFileSync(f, "utf8");
      for (const needle of FORBIDDEN) if (text.includes(needle)) hits.push(`${f}: ${needle}`);
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

if (hits.length > 0) {
  console.error("Test-only code found in the production bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("check-prod-bundle: no test-only code in the production bundle");
