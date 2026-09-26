import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// Production build uses process.cwd() for path resolution

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    maxAge: "1y",
    immutable: true,
    setHeaders: (res, filePath) => {
      // Only content-hashed build assets (/assets/*) are truly immutable.
      // Everything else (index.html, sw.js, manifest) must revalidate or
      // devices pin a stale app shell for up to a year.
      if (!filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
