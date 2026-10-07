import { normalizeToolUrl } from "@/lib/claims/message";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tools } from "@/db/schema";
import { getEnv } from "@/lib/env";
import type { ToolHealth } from "@/lib/types";

export interface RepoTool {
  id: number;
  url: string;
}

export interface RepoUpdate {
  stars: number;
  isFork: boolean;
  lastCommitAt: Date | null;
  health: ToolHealth;
}

export interface GithubDeps {
  listRepoTools: () => Promise<RepoTool[]>;
  update: (id: number, u: RepoUpdate) => Promise<void>;
  fetchImpl?: typeof fetch;
  token?: string;
  now?: () => Date;
}

export interface GithubReport {
  updated: number;
  notFound: number;
  errors: number;
  rateLimited: boolean;
}

const DAY = 86_400_000;
const MIN_REMAINING = 5;

export function parseRepo(url: string): { owner: string; repo: string } | null {
  const m = /^github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/.*)?$/.exec(normalizeToolUrl(url));
  return m ? { owner: m[1], repo: m[2] } : null;
}

export function healthFor(lastCommit: Date | null, now: Date): ToolHealth {
  if (!lastCommit) return "unknown";
  const age = now.getTime() - lastCommit.getTime();
  return age <= 90 * DAY ? "active" : age <= 365 * DAY ? "slow" : "dormant";
}

const defaults: GithubDeps = {
  listRepoTools: async () => getDb().select({ id: tools.id, url: tools.url }).from(tools).where(eq(tools.kind, "repo")),
  update: async (id, u) => {
    await getDb().update(tools).set(u).where(eq(tools.id, id));
  },
};

/** One GitHub call per repo tool; stops early when the rate limit is nearly exhausted. */
export async function runGithub(deps: GithubDeps = defaults): Promise<GithubReport> {
  const f = deps.fetchImpl ?? fetch;
  const token = deps.token ?? getEnv().GITHUB_TOKEN;
  const now = (deps.now ?? (() => new Date()))();
  const report: GithubReport = { updated: 0, notFound: 0, errors: 0, rateLimited: false };

  for (const t of await deps.listRepoTools()) {
    const repo = parseRepo(t.url);
    if (!repo) continue;
    try {
      const res = await f(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "proof-of-tooling",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "1000");
      if (res.status === 429 || (res.status === 403 && remaining === 0)) {
        report.rateLimited = true;
        break;
      }
      if (res.status === 404) {
        report.notFound++;
      } else if (!res.ok) {
        report.errors++;
      } else {
        const j = (await res.json()) as { stargazers_count?: unknown; fork?: unknown; pushed_at?: unknown };
        const last = typeof j.pushed_at === "string" ? new Date(j.pushed_at) : null;
        const lastCommitAt = last && !Number.isNaN(last.getTime()) ? last : null;
        await deps.update(t.id, {
          stars: typeof j.stargazers_count === "number" ? j.stargazers_count : 0,
          isFork: j.fork === true,
          lastCommitAt,
          health: healthFor(lastCommitAt, now),
        });
        report.updated++;
      }
      if (remaining <= MIN_REMAINING) {
        report.rateLimited = true;
        break;
      }
    } catch {
      report.errors++;
    }
  }
  return report;
}
