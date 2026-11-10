import { describe, expect, test, vi } from "vitest";
import { guardMiddleware } from "../guard-middleware.js";

/** The pieces of a Response a guard touches, so a rejection can be observed. */
function fakeRes() {
  const res: any = {
    headersSent: false,
    statusCode: 200,
    body: null as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe("guardMiddleware", () => {
  test("answers 500 instead of hanging when an async guard rejects", async () => {
    const boom = guardMiddleware("requireAuthOrApiKey", async () => {
      throw new Error("connection terminated unexpectedly");
    });
    const res = fakeRes();
    const next = vi.fn();

    await boom({ method: "GET", originalUrl: "/api/companies/7/branches" } as any, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Failed to verify access");
    expect(next).not.toHaveBeenCalled();
  });

  test("still settles for a caller that awaits it", async () => {
    let settled = false;
    const slow = guardMiddleware("guard", async (_req: any, res: any) => {
      await new Promise((r) => setTimeout(r, 10));
      settled = true;
      res.status(403).json({ message: "no access" });
    });
    const res = fakeRes();

    await slow({} as any, res, vi.fn());

    expect(settled).toBe(true);
    expect(res.statusCode).toBe(403);
  });

  test("lets a synchronous throw reach the same handler", async () => {
    const bad = guardMiddleware("guard", (() => {
      throw new Error("bad token");
    }) as any);
    const res = fakeRes();

    await bad({} as any, res, vi.fn());

    expect(res.statusCode).toBe(500);
  });

  test("passes a guard that succeeds straight through", async () => {
    const ok = guardMiddleware("guard", async (_req: any, _res: any, next: any) => next());
    const next = vi.fn();

    await ok({} as any, fakeRes(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  test("does not write over a response already sent", async () => {
    const late = guardMiddleware("guard", async (_req: any, res: any) => {
      res.status(200).json({ done: true });
      res.headersSent = true;
      throw new Error("too late");
    });
    const res = fakeRes();

    await late({} as any, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ done: true });
  });
});
