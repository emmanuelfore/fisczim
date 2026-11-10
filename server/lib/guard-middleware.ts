import type { NextFunction, Response } from "express";

/**
 * Express 4 catches a middleware that throws synchronously, but it ignores the
 * promise returned by an async one, so a rejected database read inside a guard
 * never reaches the error handler and the client waits for a response that will
 * not come. Wrapping the guard answers 500 instead of hanging.
 */
export function guardMiddleware<
  F extends (req: any, res: Response, next: NextFunction) => unknown,
>(name: string, fn: F): F {
  const wrapped = (req: any, res: Response, next: NextFunction): unknown => {
    try {
      const result = fn(req, res, next);
      // Hand the promise back with the rejection already observed, so a caller that
      // awaits the guard still waits for it to settle.
      if (result instanceof Promise) return result.catch((err) => fail(name, req, res, err));
      return result;
    } catch (err) {
      return fail(name, req, res, err);
    }
  };
  return wrapped as F;
}

function fail(name: string, req: any, res: Response, err: unknown) {
  console.error(`[${name}] middleware failed for ${req?.method} ${req?.originalUrl}:`, err);
  if (!res.headersSent) res.status(500).json({ message: "Failed to verify access" });
}
