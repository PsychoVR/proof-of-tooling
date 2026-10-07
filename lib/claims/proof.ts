import type { ClaimCheckResult } from "@/lib/types";

export interface FetchedFile {
  status: number;
  body: string;
}
/**
 * Injected so tests need no network. The real fetcher must enforce a timeout,
 * a size cap, and refuse redirects or DNS results that point to private addresses.
 */
export type Fetcher = (url: string) => Promise<FetchedFile>;

export const PROOF_FILE = ".proof-of-tooling.json";
export const WELL_KNOWN_PATH = "/.well-known/proof-of-tooling.json";
export const MAX_PROOF_BYTES = 64 * 1024;

const GITHUB_REPO = /^github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** Maps a normalized tool URL to its proof file location, or null when unsupported. */
export function proofFileUrl(toolUrl: string): { kind: "repo" | "web"; url: string } | null {
  const gh = GITHUB_REPO.exec(toolUrl);
  if (gh) {
    if (gh[2] === "." || gh[2] === "..") return null;
    // HEAD resolves to the default branch.
    return { kind: "repo", url: `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/HEAD/${PROOF_FILE}` };
  }
  // Web tools are identified by a bare domain (no path, port or credentials).
  if (DOMAIN.test(toolUrl) && toolUrl !== "github.com") {
    return { kind: "web", url: `https://${toolUrl}${WELL_KNOWN_PATH}` };
  }
  return null;
}

export async function checkProofFile(
  toolUrl: string,
  identity: string,
  fetcher: Fetcher,
): Promise<ClaimCheckResult> {
  const target = proofFileUrl(toolUrl);
  if (!target) return { id: "proof", ok: false, detail: "Unsupported tool URL." };

  let file: FetchedFile;
  try {
    file = await fetcher(target.url);
  } catch {
    return { id: "proof", ok: false, detail: "Could not fetch the proof file." };
  }
  if (file.status !== 200) {
    return { id: "proof", ok: false, detail: `Proof file not found (HTTP ${file.status}).` };
  }
  if (new TextEncoder().encode(file.body).length > MAX_PROOF_BYTES) {
    return { id: "proof", ok: false, detail: "Proof file is too large." };
  }
  let json: unknown;
  try {
    json = JSON.parse(file.body);
  } catch {
    return { id: "proof", ok: false, detail: "Proof file is not valid JSON." };
  }
  const identities = (json as { identities?: unknown } | null)?.identities;
  if (!Array.isArray(identities)) {
    return { id: "proof", ok: false, detail: 'Proof file must contain {"identities": [...]}.' };
  }
  if (!identities.includes(identity)) {
    return { id: "proof", ok: false, detail: "Identity is not listed in the proof file." };
  }
  return { id: "proof", ok: true };
}
