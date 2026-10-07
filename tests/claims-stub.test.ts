import { describe, expect, it, vi } from "vitest";
import { e2eOverrides as production } from "@/lib/claims-stub";
import { e2eOverrides, isLocalDockerDb } from "@/lib/claims-stub.e2e";

const DOCKER = "mysql://pot:pot_dev_password@localhost:3307/proof_of_tooling";

describe("production claims-stub", () => {
  it("is a no-op: the deployed bundle has no test double", () => {
    expect(production()).toBeNull();
  });
});

describe("isLocalDockerDb (guard of the e2e test double)", () => {
  it("accepts only the exact docker-compose connection string", () => {
    expect(isLocalDockerDb(DOCKER)).toBe(true);
    expect(isLocalDockerDb("mysql://pot:other@127.0.0.1:3307/proof_of_tooling")).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["garbage", "not a url"],
    ["production host", "mysql://pot:x@srv123.hstgr.io:3306/proof_of_tooling"],
    ["wrong port (SSH tunnel to another database on 3306)", "mysql://pot:x@localhost:3306/proof_of_tooling"],
    ["wrong database name", "mysql://pot:x@localhost:3307/prod_database"],
    ["wrong user", "mysql://root:x@localhost:3307/proof_of_tooling"],
    ["socketPath redirects the real connection", `${DOCKER}?socketPath=/var/run/mysqld/mysqld.sock`],
    ["host override in the query", `${DOCKER}?host=prod.example.com`],
    ["port override in the query", `${DOCKER}?port=3306`],
    ["fragment", `${DOCKER}#x`],
    ["uppercase host", "mysql://pot:x@LOCALHOST:3307/proof_of_tooling"],
    ["trailing dot host", "mysql://pot:x@localhost.:3307/proof_of_tooling"],
    ["ipv6 loopback", "mysql://pot:x@[::1]:3307/proof_of_tooling"],
    ["short ipv4", "mysql://pot:x@127.1:3307/proof_of_tooling"],
    ["hex ipv4", "mysql://pot:x@0x7f.1:3307/proof_of_tooling"],
    ["lookalike domain", "mysql://pot:x@localtest.me:3307/proof_of_tooling"],
    ["userinfo trick", "mysql://localhost:3307@prod.example.com:3306/proof_of_tooling"],
    ["https scheme", "https://pot:x@localhost:3307/proof_of_tooling"],
  ])("rejects %s", (_name, url) => {
    expect(isLocalDockerDb(url)).toBe(false);
  });
});

describe("e2eOverrides (only present in the Playwright build)", () => {
  const on = { E2E_CLAIMS_STUB: "1", DATABASE_URL: DOCKER, E2E_PROOF_IDENTITIES: "A,B", E2E_NOW: "2026-10-07T12:00:00Z" };

  it("does nothing without the exact switch or outside the docker database", () => {
    for (const env of [{}, { ...on, E2E_CLAIMS_STUB: "true" }, { ...on, E2E_CLAIMS_STUB: " 1" }, { ...on, E2E_CLAIMS_STUB: "0" }, { ...on, DATABASE_URL: "mysql://pot:x@prod:3306/proof_of_tooling" }, { ...on, DATABASE_URL: `${DOCKER}?socketPath=/s` }]) {
      expect(e2eOverrides(env)).toBeNull();
    }
  });

  it("fixes the clock, answers proof files and repo metadata, and warns when active", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const o = e2eOverrides(on)!;
    expect(o.now!().toISOString()).toBe("2026-10-07T12:00:00.000Z");
    expect(JSON.parse((await o.fetcher!("https://x.example/.well-known/proof-of-tooling.json")).body)).toEqual({ identities: ["A", "B"] });
    expect(await o.getRepoMetadata!("github.com/a/b")).toMatchObject({ isPrivate: false, commitCount: 40 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(e2eOverrides({ ...on, E2E_NOW: undefined })!.now!().toISOString()).toBe("2026-10-07T12:00:00.000Z");
  });
});
