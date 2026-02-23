import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Serve public/examples directory for GIF examples (safe public files only)
  const publicExamplesPath = path.resolve(import.meta.dirname, "..", "public", "examples");
  app.use("/examples", express.static(publicExamplesPath));

  // Skip Vite middleware for API routes to avoid any proxying/buffering issues
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return vite.middlewares(req, res, next);
  });
  
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    
    // Don't handle API routes in the catch-all
    if (url.startsWith('/api')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Preload index.html into memory for fast health check response
  const indexPath = path.resolve(distPath, "index.html");
  let indexHtml: string;
  try {
    indexHtml = fs.readFileSync(indexPath, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read index.html from ${indexPath}: ${err}`);
  }

  // Serve public/examples directory for GIF examples (safe public files only)
  const publicExamplesPath = path.resolve(import.meta.dirname, "..", "public", "examples");
  app.use("/examples", express.static(publicExamplesPath));

  // Serve static files with aggressive caching for hashed assets
  // Vite adds content hashes to filenames, so they can be cached forever
  app.use(express.static(distPath, { 
    index: false,
    maxAge: '1y', // Cache for 1 year (files have content hashes)
    immutable: true, // Tell browsers the file will never change
    etag: true,
    lastModified: true,
  }));

  // Fast response with preloaded index.html for all routes (including '/')
  app.use("*", (_req, res) => {
    res.status(200).type('html').send(indexHtml);
  });
}
