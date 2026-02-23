import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedAdmin } from "./seed-admin";
import { startScheduledTasks } from "./scheduledTasks";
import { migrateFileIds } from "./migrate-file-ids";
import { seedHolidayGiftPrizes } from "./holiday-gifts-seed";
import { setupTelegramWebhook } from "./telegram";

const app = express();

// Enable Gzip compression for all responses
// Significantly reduces response sizes (3-5x smaller)
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    if (req.path?.includes('/content/render') && req.method === 'POST') {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// NO body parsing at all - let individual routes handle their own parsing
// This fixes issues with large file uploads being rejected before reaching Multer

// Health check endpoints - MUST be first, before ANY middleware
// Dedicated /health endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Fast health check for root '/' - deployment checks this
// Health checks are simple GET requests with minimal headers
app.get('/', (req, res, next) => {
  const accept = req.headers.accept || '';
  const userAgent = req.headers['user-agent'] || '';
  
  // Health checks typically:
  // - Accept */* or no Accept header
  // - Have minimal/no User-Agent
  // - Have no cookies or referer
  const isSimpleRequest = !req.headers.cookie && 
                          !req.headers.referer &&
                          !userAgent.includes('Mozilla') &&
                          (accept === '*/*' || accept === '' || !accept.includes('text/html'));
  
  if (isSimpleRequest) {
    return res.status(200).send('OK');
  }
  
  // Browser request - fall through to static file server
  next();
});

// Security headers middleware - increases trust with ISPs and browsers
app.use((req, res, next) => {
  // HSTS - Force HTTPS for 1 year
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Restrict browser features (allow self for Wayforpay fraud checks and future media features)
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self)');
  
  // XSS Protection (legacy but still useful for older browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy - permissive to avoid breaking functionality
  // Allows: self, inline styles/scripts (for React), data URIs, blob URLs, and common CDNs
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://www.google.com https://www.gstatic.com https://secure.wayforpay.com https://cdn.jotfor.ms",
    "script-src-elem 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.google.com https://www.gstatic.com https://secure.wayforpay.com https://cdn.jotfor.ms",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://secure.wayforpay.com https://cdn.jotfor.ms",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://secure.wayforpay.com https://cdn.jotfor.ms",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://api.spotify.com https://www.googleapis.com https://accounts.google.com https://secure.wayforpay.com https://gisco-services.ec.europa.eu https://api.jotform.com wss:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://secure.wayforpay.com https://accounts.google.com https://form.jotform.com https://eu.jotform.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://secure.wayforpay.com"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  
  // Cache-Control for API responses (prevent caching of sensitive data)
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
});

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
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('[ERROR]', err);
    res.status(status).json({ message });
  });

  // Process-level error handlers to prevent crashes
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] at:', promise, 'reason:', reason);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Configure server for large file uploads
  server.maxHeadersCount = 0; // No limit on headers
  server.headersTimeout = 0; // No timeout for headers
  server.requestTimeout = 0; // No timeout for requests
  server.timeout = 0; // No timeout

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
    log(`Server ready - admin seeding will happen on first admin login`);
    
    // Run file ID migration and seed holiday gifts on startup
    migrateFileIds().then(() => {
      seedHolidayGiftPrizes().then(() => {
        startScheduledTasks();
        
        // Setup Telegram webhook for organization notifications
        // IMPORTANT: Only configure in production to prevent dev server from overwriting production webhook
        // Uses DEPLOY_ENV=production or REPLIT_DEPLOYMENT to detect production environment
        const isProduction = process.env.DEPLOY_ENV === 'production' || 
                             process.env.REPLIT_DEPLOYMENT === '1' ||
                             process.env.NODE_ENV === 'production';
        const domain = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim();
        
        if (isProduction && domain && process.env.TELEGRAM_BOT_TOKEN) {
          const webhookUrl = `https://${domain}/api/telegram/webhook`;
          setupTelegramWebhook(webhookUrl).then(success => {
            if (success) {
              log(`Telegram webhook configured for production: ${webhookUrl}`);
            }
          });
        } else if (!isProduction) {
          log('Telegram webhook setup skipped (not production environment)');
        }
      });
    });
  });
})();
