import fs from "fs";
import path from "path";
import { isLocalMode } from "./db";

const LFS_VERSION = "1.0.0";

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

export function getUpdateState(): UpdateState & { currentVersion: string } {
  return { ...updateState, currentVersion: LFS_VERSION };
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

    console.log(`[lfs-update] Backing up current version to ${backupDir}`);
    const filesToBackup = ["server.cjs", "package.json"];
    for (const file of filesToBackup) {
      const src = path.join(installDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupDir, file));
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

    console.log("[lfs-update] Update downloaded. Extraction requires manual restart.");
    console.log(`[lfs-update] Archive saved at: ${archivePath}`);
    console.log("[lfs-update] To apply: stop the service, extract, restart.");
    console.log(`[lfs-update] Rollback available at: ${backupDir}`);

    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[lfs-update] Update failed: ${msg}`);
    updateState.lastError = msg;
    return false;
  }
}

export function startAutoUpdateChecker() {
  if (!isLocalMode) return;
  if (process.env.LFS_AUTO_UPDATE === "false") {
    console.log("[lfs-update] Auto-update disabled");
    return;
  }

  const intervalMs = parseInt(process.env.LFS_UPDATE_CHECK_INTERVAL_MS || "3600000", 10);

  console.log(`[lfs-update] Auto-update checker started (interval: ${Math.floor(intervalMs / 60000)}m)`);

  setTimeout(() => checkForUpdate(), 30000);

  updateInterval = setInterval(async () => {
    const info = await checkForUpdate();
    if (info?.downloadUrl && updateState.updateAvailable) {
      if (process.env.LFS_AUTO_APPLY_UPDATES === "true") {
        await downloadAndApplyUpdate(info);
      }
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
