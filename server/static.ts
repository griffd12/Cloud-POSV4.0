import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express, isLfsMode = false) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    if (isLfsMode) {
      throw new Error(
        `[static] FATAL: Frontend directory not found at ${distPath} — LFS cannot serve POS app for offline browser refresh`,
      );
    }
    console.warn(
      `[static] Frontend directory not found at ${distPath} — browser refresh will not serve the POS app`,
    );
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    if (isLfsMode) {
      throw new Error(
        `[static] FATAL: index.html not found in ${distPath} — LFS cannot serve POS app`,
      );
    }
    console.warn(
      `[static] index.html not found in ${distPath} — frontend serving disabled`,
    );
    return;
  }

  const assetCount = fs.existsSync(path.resolve(distPath, "assets"))
    ? fs.readdirSync(path.resolve(distPath, "assets")).length
    : 0;
  const mode = isLfsMode ? "LFS" : "cloud";
  console.log(`[static] Serving frontend from ${distPath} (${assetCount} assets, ${mode} mode)`);

  app.use(express.static(distPath, {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
