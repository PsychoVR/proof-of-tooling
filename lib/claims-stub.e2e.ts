import type { ClaimsDeps } from "@/lib/claims-service";

/**
 * True only for the exact connection string of the local docker database (docker-compose.yml):
 * mysql://pot:<password>@localhost:3307/proof_of_tooling, with no query string (so no socketPath
 * or other driver options can redirect the connection).
 */
export function isLocalDockerDb(raw: string | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === "mysql:" &&
    (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
    u.port === "3307" &&
    u.pathname === "/proof_of_tooling" &&
    u.username === "pot" &&
    u.search === "" &&
    u.hash === ""
  );
}

/**
 * Test double for the Playwright suite: fixed clock and canned network answers, real database.
 * Only compiled into the e2e build, and still refuses to act unless E2E_CLAIMS_STUB=1 and the
 * database is the local docker one.
 */
export function e2eOverrides(env: Record<string, string | undefined> = process.env): Partial<ClaimsDeps> | null {
  if (env.E2E_CLAIMS_STUB !== "1" || !isLocalDockerDb(env.DATABASE_URL)) return null;
  const identities = (env.E2E_PROOF_IDENTITIES ?? "").split(",").filter(Boolean);
  console.warn("[e2e] claim verification is using the test double (fixed clock, canned proof files)");
  return {
    now: () => new Date(env.E2E_NOW ?? "2026-10-07T12:00:00Z"),
    fetcher: async () => ({ status: 200, body: JSON.stringify({ identities }) }),
    resolveTxt: async () => [],
    getRepoMetadata: async () => ({ isPrivate: false, archived: false, isFork: false, commitCount: 40, ownCommits: 40, createdAt: "2026-01-01T00:00:00Z" }),
  };
}
