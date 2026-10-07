import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../proxy";

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("proxy: malformed percent-encoding is a client error, not a 500", () => {
  it("answers 404 for pages", async () => {
    for (const path of ["/v/%E0%A4%A", "/v/%", "/t/%E0%A4%A", "/t/abc%zz"]) {
      const res = proxy(req(path));
      expect(res.status, path).toBe(404);
    }
  });

  it("answers 400 with JSON for the API", async () => {
    const res = proxy(req("/api/v1/validators/%E0%A4%A"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid path" });
  });

  it("lets valid and merely unusual paths through", () => {
    for (const path of ["/v/21CzjGL6u9LircpHKpRH9myUuRD634ZYXaf1ncqQLhwh", "/v/%C3%A9", "/t/watchtower", "/api/v1/stats"]) {
      const res = proxy(req(path));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("only runs on the routes that decode dynamic segments", () => {
    expect(config.matcher).toEqual(["/v/:path*", "/t/:path*", "/api/v1/:path*"]);
  });
});
