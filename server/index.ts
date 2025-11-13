// Load environment variables FIRST before any other imports
import "./env";

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { globalLimiter } from "./middleware/rateLimiter";
import { initializeDatabase } from "./db-init";
import { intelligentQueryService } from "./ml/intelligentQueryService";
import { pool } from "./db";

const app = express();

// Trust proxy for production environments (enables secure cookies behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration
const PgSession = connectPgSimple(session);
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.warn('⚠️  WARNING: SESSION_SECRET is not set! Using a default secret. This is insecure for production!');
}

app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'sessions',
    createTableIfMissing: false,
  }),
  secret: SESSION_SECRET || 'change-me-in-production-insecure-default',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // CSRF Protection: 'lax' provides good protection while allowing the cookie to work properly.
    // 'lax' prevents CSRF on state-changing requests (POST/PUT/DELETE) while allowing
    // the cookie to be sent with safe GET requests and top-level navigation.
    // This is necessary for proper session functionality in development and production.
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Apply global rate limiting to all API routes
app.use("/api", globalLimiter);

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

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database tables on startup
  await initializeDatabase();
  
  // Initialize Intelligent Query Service (unified NLP)
  log('Initializing Intelligent Query Service...');
  await intelligentQueryService.initialize();
  log('Intelligent Query Service ready');
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
