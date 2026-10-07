import { afterEach, describe, expect, it, vi } from "vitest";
import { createTxtResolver } from "@/lib/dns-txt";

afterEach(() => vi.useRealTimers());

describe("createTxtResolver", () => {
  it("passes the records through", async () => {
    const r = createTxtResolver(async () => [["a", "b"]]);
    expect(await r("x.example.com")).toEqual([["a", "b"]]);
  });

  it("passes DNS errors through", async () => {
    const r = createTxtResolver(async () => {
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    });
    await expect(r("x.example.com")).rejects.toMatchObject({ code: "ENOTFOUND" });
  });

  it("gives up after the overall deadline", async () => {
    vi.useFakeTimers();
    const r = createTxtResolver(() => new Promise(() => {}), 1000);
    const p = r("x.example.com");
    const assertion = expect(p).rejects.toThrow("dns timeout");
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });
});
