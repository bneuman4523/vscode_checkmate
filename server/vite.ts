import { createChildLogger } from './logger';
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";

const logger = createChildLogger('Vite');

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // In production this function should never be called.
  // Uses Function constructor to create a dynamic import that esbuild cannot analyze or bundle.
  const loadModule = new Function('p', 'return import(p)');
  const { setupViteDev } = await loadModule('./vite-dev.js');
  await setupViteDev(app, server);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // But skip /api routes - they should be handled by Express routes
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
