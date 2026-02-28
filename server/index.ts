import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cors from "cors";
import compression from "compression";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { setupSwagger } from "./swagger.js";
// import { startRecurringInvoiceWorker } from "./jobs.js";

console.log("ENV variables loaded:", process.env.PORT);

const app = express();
app.use(cors());
app.use(compression());

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Parse JSON and URL-encoded
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// Request logging
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

// Initialize the app
async function initializeApp() {
  try {
    // Setup Swagger & Routes
    setupSwagger(app);
    await registerRoutes(httpServer, app);

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      if (process.env.NODE_ENV !== "production") console.error(err);
    });

    // Static files or Vite dev
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite.js");
      await setupVite(httpServer, app);
    }

    // Start HTTP server
    const port = parseInt(process.env.PORT || "5001", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });

    // Start recurring jobs (optional)
    // startRecurringInvoiceWorker();
  } catch (err) {
    console.error("Failed to initialize app:", err);
    process.exit(1); // exit so PM2 restarts if needed
  }
}

// Export for Vercel / other modules
export { app, httpServer };
export default app;

// Run initializeApp when executed directly
if (require.main === module) {
  initializeApp();
}