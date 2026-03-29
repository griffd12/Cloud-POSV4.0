import fs from "fs";
import path from "path";
import { isLocalMode } from "./db";

function getLfsVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return pkg.version || "0.0.0";
    }
  } catch {}
  return "0.0.0";
}

const LFS_VERSION = getLfsVersion();

interface UpdateInfo {
  version: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
  checksum: string | null;
}

interface UpdateState {
  lastCheckAt: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  lastError: string | null;
}

let updateState: UpdateState = {
  lastCheckAt: null,
  latestVersion: null,
  updateAvailable: false,
  downloadUrl: null,
  lastError: null,
};

let updateInterval: ReturnType<typeof setInterval> | null = null;

export function getUpdateState(): UpdateState & { currentVersion: string; autoUpdateEnabled: boolean } {
  return {
    ...updateState,
    currentVersion: LFS_VERSION,
    autoUpdateEnabled: process.env.LFS_AUTO_UPDATE !== "false",
  };
}

async function checkForUpdate(): Promise<UpdateInfo | null> {
  const cloudUrl = process.env.LFS_CLOUD_URL;
  const apiKey = process.env.LFS_API_KEY;

  if (!cloudUrl) return null;

  try {
    const res = await fetch(`${cloudUrl}/api/lfs/sync/latest-version`, {
      headers: {
        ...(apiKey ? { "x-lfs-api-key": apiKey } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      updateState.lastError = `HTTP ${res.status}`;
      return null;
    }

    const data = await res.json();
    updateState.lastCheckAt = new Date().toISOString();
    updateState.latestVersion = data.version;
    updateState.updateAvailable = data.version !== LFS_VERSION;
    updateState.downloadUrl = data.downloadUrl || null;
    updateState.lastError = null;

    if (updateState.updateAvailable) {
      console.log(`[lfs-update] Update available: ${LFS_VERSION} → ${data.version}`);
    }

    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    updateState.lastError = msg;
    console.warn(`[lfs-update] Update check failed: ${msg}`);
    return null;
  }
}

async function downloadAndApplyUpdate(info: UpdateInfo): Promise<boolean> {
  if (!info.downloadUrl) {
    console.log("[lfs-update] No download URL provided — manual update required");
    return false;
  }

  const installDir = process.cwd();
  const backupDir = path.join(installDir, "backups", `v${LFS_VERSION}-${Date.now()}`);
  const tempDir = path.join(installDir, "temp-update");

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });

    const filesToBackup = ["server.cjs", "lfs-admin"];
    console.log(`[lfs-update] Backing up current version to ${backupDir}`);
    for (const file of filesToBackup) {
      const src = path.join(installDir, file);
      if (fs.existsSync(src)) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          copyDirSync(src, path.join(backupDir, file));
        } else {
          fs.copyFileSync(src, path.join(backupDir, file));
        }
      }
    }

    console.log(`[lfs-update] Downloading update from ${info.downloadUrl}`);
    const res = await fetch(info.downloadUrl, {
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }

    const archivePath = path.join(tempDir, "update.tar.gz");
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(archivePath, Buffer.from(arrayBuffer));

    if (!info.checksum) {
      throw new Error("Update rejected: no checksum provided. Server must supply a SHA-256 checksum for integrity verification.");
    }

    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
    if (hash !== info.checksum) {
      throw new Error(`Checksum mismatch: expected ${info.checksum}, got ${hash}`);
    }
    console.log("[lfs-update] Checksum verified");

    console.log("[lfs-update] Extracting update...");
    const { execSync } = await import("child_process");
    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: "pipe" });
    } catch {
      throw new Error("Failed to extract update archive");
    }

    const extractedContents = fs.readdirSync(extractDir);
    let sourceDir = extractDir;
    if (extractedContents.length === 1) {
      const inner = path.join(extractDir, extractedContents[0]);
      if (fs.statSync(inner).isDirectory()) {
        sourceDir = inner;
      }
    }

    const updateFiles = ["server.cjs", "lfs-admin"];
    console.log("[lfs-update] Applying update files...");
    for (const file of updateFiles) {
      const src = path.join(sourceDir, file);
      const dest = path.join(installDir, file);
      if (fs.existsSync(src)) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
          copyDirSync(src, dest);
        } else {
          fs.copyFileSync(src, dest);
        }
        console.log(`[lfs-update] Updated: ${file}`);
      }
    }

    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log("[lfs-update] Update applied successfully. Restarting server...");
    updateState.lastError = null;

    setTimeout(() => {
      console.log("[lfs-update] Triggering restart...");
      process.exit(100);
    }, 1000);

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[lfs-update] Update failed: ${msg}. Rolling back...`);
    updateState.lastError = msg;

    try {
      const filesToRestore = ["server.cjs", "lfs-admin"];
      for (const file of filesToRestore) {
        const backup = path.join(backupDir, file);
        const dest = path.join(installDir, file);
        if (fs.existsSync(backup)) {
          const stat = fs.statSync(backup);
          if (stat.isDirectory()) {
            if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
            copyDirSync(backup, dest);
          } else {
            fs.copyFileSync(backup, dest);
          }
        }
      }
      console.log("[lfs-update] Rollback completed");
    } catch (rollbackErr) {
      console.error("[lfs-update] Rollback also failed:", rollbackErr);
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    return false;
  }
}

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function startAutoUpdateChecker() {
  if (!isLocalMode) return;
  if (process.env.LFS_AUTO_UPDATE === "false") {
    console.log("[lfs-update] Auto-update disabled (LFS_AUTO_UPDATE=false)");
    return;
  }

  const intervalMs = parseInt(process.env.LFS_UPDATE_CHECK_INTERVAL_MS || "3600000", 10);

  console.log(`[lfs-update] Auto-update checker started (check+apply, interval: ${Math.floor(intervalMs / 60000)}m)`);

  setTimeout(() => checkForUpdate(), 30000);

  updateInterval = setInterval(async () => {
    const info = await checkForUpdate();
    if (info?.downloadUrl && updateState.updateAvailable) {
      console.log(`[lfs-update] Update available (${info.version}), downloading and applying...`);
      await downloadAndApplyUpdate(info);
    }
  }, intervalMs);
}

export function stopAutoUpdateChecker() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

export async function manualCheckForUpdate(): Promise<UpdateState & { currentVersion: string }> {
  await checkForUpdate();
  return getUpdateState();
}
