import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeFetcher, isPrivateIp } from "@/lib/safe-fetch";

afterEach(() => vi.useRealTimers());

class FakeRes extends EventEmitter {
  statusCode = 200;
  complete = false;
  destroyed = false;
  constructor(public headers: Record<string, string> = {}) {
    super();
  }
  destroy() {
    this.destroyed = true;
    queueMicrotask(() => this.emit("close"));
  }
  /** Normal finish: the whole body arrived. */
  finish() {
    this.complete = true;
    this.emit("end");
    this.emit("close");
  }
}
class FakeReq extends EventEmitter {
  destroyed = false;
  end() {}
  destroy(err?: Error) {
    this.destroyed = true;
    if (err) this.emit("error", err);
  }
}

/** A request function whose responses the test drives by hand. */
function harness() {
  const calls: { req: FakeReq; res: FakeRes; deliver: (headers?: Record<string, string>) => FakeRes }[] = [];
  const request = ((_url: URL, _o: unknown, cb: (r: FakeRes) => void) => {
    const req = new FakeReq();
    const res = new FakeRes();
    calls.push({
      req,
      res,
      deliver: (headers = {}) => {
        res.headers = headers;
        cb(res);
        return res;
      },
    });
    return req;
  }) as never;
  return { calls, request };
}

const URL_OK = "https://example.com/proof.txt";

describe("safeFetcher: deadline, truncation and size (M5)", () => {
  it("returns a complete body", async () => {
    const { calls, request } = harness();
    const p = createSafeFetcher({ request })(URL_OK);
    const res = calls[0].deliver({ "content-length": "5" });
    res.emit("data", Buffer.from("hello"));
    res.finish();
    expect(await p).toEqual({ status: 200, body: "hello" });
  });

  it("aborts a slow-drip server at the global deadline", async () => {
    vi.useFakeTimers();
    const { calls, request } = harness();
    const p = createSafeFetcher({ request, timeoutMs: 5000 })(URL_OK);
    const assertion = expect(p).rejects.toThrow("timeout");
    const res = calls[0].deliver();
    for (let i = 0; i < 4; i++) {
      res.emit("data", Buffer.from("x"));
      await vi.advanceTimersByTimeAsync(1000); // each drip resets a socket idle timer, but not this one
    }
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(calls[0].req.destroyed).toBe(true);
  });

  it("rejects a connection that closes before the body is complete", async () => {
    const { calls, request } = harness();
    const p = createSafeFetcher({ request })(URL_OK);
    const res = calls[0].deliver({ "content-length": "100" });
    res.emit("data", Buffer.from("partial"));
    res.emit("close"); // res.complete is still false
    await expect(p).rejects.toThrow("incomplete response");
  });

  it("rejects early on a huge Content-Length without reading the body", async () => {
    const { calls, request } = harness();
    const p = createSafeFetcher({ request })(URL_OK);
    const res = calls[0].deliver({ "content-length": String(10 * 1024 * 1024) });
    await expect(p).rejects.toThrow("response too large");
    expect(res.destroyed).toBe(true);
  });

  it("stops reading past the cap and returns an over-cap body", async () => {
    const { calls, request } = harness();
    const p = createSafeFetcher({ request, maxBytes: 10 })(URL_OK);
    const res = calls[0].deliver();
    res.emit("data", Buffer.alloc(11, "a"));
    const r = await p;
    expect(r.body.length).toBe(11);
    expect(res.destroyed).toBe(true);
  });

  it("propagates request errors", async () => {
    const { calls, request } = harness();
    const p = createSafeFetcher({ request })(URL_OK);
    calls[0].req.emit("error", new Error("ECONNRESET"));
    await expect(p).rejects.toThrow("ECONNRESET");
  });
});

describe("safeFetcher: global concurrency (M5)", () => {
  it("runs at most N requests at once, queues the rest, and refuses past the queue cap", async () => {
    const { calls, request } = harness();
    const fetcher = createSafeFetcher({ request, maxConcurrent: 2, maxQueue: 1 });
    const settled: Promise<unknown>[] = [];
    for (let i = 0; i < 3; i++) settled.push(fetcher(URL_OK));
    expect(calls).toHaveLength(2); // third is queued
    await expect(fetcher(URL_OK)).rejects.toThrow("busy"); // queue full
    // Finishing one request starts the queued one.
    const res = calls[0].deliver();
    res.emit("data", Buffer.from("a"));
    res.finish();
    await settled[0];
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    for (const c of calls.slice(1)) {
      const r = c.res.complete ? c.res : c.deliver();
      r.finish();
    }
    await Promise.all(settled);
  });

  it("frees the slot when a request fails", async () => {
    const { calls, request } = harness();
    const fetcher = createSafeFetcher({ request, maxConcurrent: 1, maxQueue: 5 });
    const a = fetcher(URL_OK);
    const b = fetcher(URL_OK);
    calls[0].req.emit("error", new Error("boom"));
    await expect(a).rejects.toThrow("boom");
    expect(calls).toHaveLength(2);
    calls[1].deliver().finish();
    await expect(b).resolves.toMatchObject({ status: 200 });
  });
});

describe("isPrivateIp: reserved ranges (B1)", () => {
  it.each([
    "192.0.0.1", "192.0.2.10", "198.51.100.7", "203.0.113.99", "192.88.99.1",
    "fec0::1", "ff02::1", "ff00::", "2002:c000:0204::1", "2002::1", "64:ff9b::1", "2001:db8::5",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:192.168.0.1", "::10.0.0.1", "::ffff:0:0",
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["192.0.1.1", "198.51.101.1", "203.0.114.1", "192.88.98.1", "2606:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8", "::ffff:808:808"])(
    "allows %s",
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );
});
