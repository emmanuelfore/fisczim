import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { createServer } from "http";
import { setupSwagger } from "./swagger.js";
import { startRecurringInvoiceWorker, startFiscalDayClosingWorker } from "./jobs.js";
import { startFiscalizationWorker } from "./workers/fiscalization_worker.js";
import { seedGlobalPayrollDefaults } from "./lib/payroll-seeding.js";
import { initializeScheduler } from "./scheduler.js";

import cors from "cors";
import compression from "compression";

// ... imports

const app = express();
app.use(cors()); // Allow all origins for dev simplicity // Allow all origins for dev simplicity
app.use(compression());
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// API Logging Middleware - Logs all API requests to api_logs table
app.use(async (req: any, res: any, next) => {
  const startTime = Date.now();
  
  // Store original send function
  const originalSend = res.send;
  
  // Override send to log the response
  res.send = function (body: any) {
    const responseTime = Date.now() - startTime;
    
    // Try to extract companyId from various sources
    let companyId = null;
    if (req.params?.companyId) companyId = Number(req.params.companyId);
    else if (req.params?.id) companyId = Number(req.params.id);
    else if (req.company?.id) companyId = req.company.id;
    else if (req.user?.companyId) companyId = req.user.companyId;
    else if ((req as any).apiKeyCompanyId) companyId = (req as any).apiKeyCompanyId;
    
    const usedApiKey = Boolean(req.headers['x-api-key']);

    // Only log if we have a companyId, it's an API request, and it was made using an API key
    if (companyId && (req.originalUrl || req.url).startsWith('/api') && usedApiKey) {
      let responseBody = body;
      try {
        if (typeof body === 'string') {
          responseBody = JSON.parse(body);
        }
      } catch (e) {
        // Leave as string if not JSON
      }
      
      // Import storage dynamically to avoid circular dependency
      import('./storage.js').then(({ storage }) => {
        storage.createApiLog({
          companyId,
          endpoint: req.originalUrl || req.url,
          method: req.method,
          requestPayload: req.body || null,
          responsePayload: responseBody,
          statusCode: res.statusCode,
          responseTimeMs: responseTime,
          ipAddress: req.ip || req.socket?.remoteAddress || null,
          userAgent: req.get('user-agent') || null
        }).catch(err => console.error("Failed to log API request:", err));
      }).catch(err => console.error("Failed to import storage for logging:", err));
    }
    
    // Call original send
    originalSend.call(this, body);
  };
  
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function summarizeResponseForLog(payload: unknown): string | undefined {
  if (payload === null || payload === undefined) return undefined;

  if (Array.isArray(payload)) {
    return JSON.stringify({ type: "array", length: payload.length });
  }

  if (typeof payload !== "object") {
    return JSON.stringify(payload);
  }

  const obj = payload as Record<string, unknown>;
  const keys = Object.keys(obj);

  const summary: Record<string, unknown> = { type: "object" };
  if (typeof obj.id !== "undefined") summary.id = obj.id;
  if (typeof obj.invoiceId !== "undefined") summary.invoiceId = obj.invoiceId;
  if (typeof obj.invoiceNumber !== "undefined") summary.invoiceNumber = obj.invoiceNumber;
  if (typeof obj.message === "string") summary.message = obj.message;
  if (typeof obj.status === "string" || typeof obj.status === "number") summary.status = obj.status;
  if (typeof obj.count === "number") summary.count = obj.count;
  if (typeof obj.total === "number") summary.total = obj.total;
  if (Array.isArray(obj.items)) summary.itemsCount = obj.items.length;
  if (Array.isArray(obj.results)) summary.resultsCount = obj.results.length;
  summary.keys = keys.slice(0, 8);
  if (keys.length > 8) summary.moreKeys = keys.length - 8;

  return JSON.stringify(summary);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown = undefined;
  const verboseResponseLogs = process.env.API_RESPONSE_LOGS === "1";

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse !== undefined) {
        if (verboseResponseLogs) {
          const raw = JSON.stringify(capturedJsonResponse);
          const maxLen = 600;
          logLine += ` :: ${raw.length > maxLen ? `${raw.slice(0, maxLen)}...<truncated>` : raw}`;
        } else {
          const summary = summarizeResponseForLog(capturedJsonResponse);
          if (summary) {
            logLine += ` :: ${summary}`;
          }
        }
      }

      log(logLine);
    }
  });

  next();
});

// Use an async function to initialize the app and routes
// This avoids top-level await which is not supported in the CJS build format
async function initializeApp() {
  // Setup application
  setupSwagger(app);
  await seedGlobalPayrollDefaults();
  await registerRoutes(httpServer, app);

  app.route("/api/user").get((req: any, res: Response) => {
    if (!req.isAuthenticated()) return res.json({ user: null });
    res.json({ user: req.user });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    if (process.env.NODE_ENV !== "production") {
      console.error(err);
    }
  });

  // Setup static files
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  }

  // Start server if not on Vercel or in development
  if (!process.env.VERCEL || process.env.NODE_ENV === "development") {
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  }

  // Start midnight fiscal day closing worker
  startFiscalDayClosingWorker();

  // Start durable fiscalization worker
  startFiscalizationWorker();
}

// Export for Vercel
export { app, httpServer };
export default app;

// Start initialization if not imported as a module (e.g. by Vercel)
// or always initialize routes if we're on Vercel (since it's a serverless entry point)
if (process.env.VERCEL || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.cjs')) {
  initializeApp().catch((err) => {
    console.error("Failed to initialize app:", err);
    process.exit(1);
  });
}
