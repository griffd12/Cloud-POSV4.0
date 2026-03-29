import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.warn(
      `[static] Frontend directory not found at ${distPath} — browser refresh will not serve the POS app`,
    );
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.warn(
      `[static] index.html not found in ${distPath} — frontend serving disabled`,
    );
    return;
  }

  const assetCount = fs.existsSync(path.resolve(distPath, "assets"))
    ? fs.readdirSync(path.resolve(distPath, "assets")).length
    : 0;
  console.log(`[static] Serving frontend from ${distPath} (${assetCount} assets)`);

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
