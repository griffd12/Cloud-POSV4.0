/**
 * CAL (Configuration Asset Library) Deployment Sync
 * 
 * Handles downloading and installing CAL packages on the Service Host.
 * - Checks for pending deployments on startup
 * - Receives real-time notifications via WebSocket
 * - Downloads package files
 * - Installs/extracts packages
 * - Executes startup scripts (install.bat/.ps1 on Windows, install.sh on Linux)
 * - Reports status back to cloud
 * - Broadcasts update status to connected workstations
 */

import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { CloudConnection } from './cloud-connection.js';
import { Database } from '../db/database.js';

const execAsync = promisify(exec);

interface PendingDeployment {
  targetId: string;
  deploymentId: string;
  packageName: string;
  packageType: string;
  versionNumber: string;
  downloadUrl: string | null;
  checksum: string | null;
  action: string;
  scheduledAt: string | null;
}

interface CalUpdateEvent {
  type: 'CAL_UPDATE_STATUS';
  status: 'starting' | 'downloading' | 'installing' | 'running_script' | 'completed' | 'failed';
  packageName: string;
  packageVersion: string;
  message: string;
  progress?: number;
  logOutput?: string;
}

type UpdateCallback = (event: CalUpdateEvent) => void;

export class CalSync {
  private db: Database;
  private cloud: CloudConnection;
  private serviceHostId: string;
  private lastCloudDisconnectLogged: boolean = false;
  private packagesDir: string;
  private calRootDir: string;
  private deploymentQueue: PendingDeployment[] = [];
  private currentlyProcessing: Set<string> = new Set();
  private successfullyCompleted: Set<string> = new Set();
  private failedWithCooldown: Map<string, number> = new Map();
  private workerRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private updateCallbacks: UpdateCallback[] = [];
  private currentDeployment: PendingDeployment | null = null;
  private scriptOutput: string[] = [];
  
  private static readonly INITIAL_RETRY_DELAY_MS = 60000;
  private static readonly MAX_RETRY_DELAY_MS = 600000;

  constructor(db: Database, cloud: CloudConnection, serviceHostId: string, dataDir: string, calRootDir: string) {
    this.db = db;
    this.cloud = cloud;
    this.serviceHostId = serviceHostId;
    this.packagesDir = path.join(dataDir, 'packages');
    this.calRootDir = calRootDir;

    if (!fs.existsSync(this.packagesDir)) {
      fs.mkdirSync(this.packagesDir, { recursive: true });
    }

    if (!fs.existsSync(this.calRootDir)) {
      fs.mkdirSync(this.calRootDir, { recursive: true });
      console.log(`[CAL] Created CAL root directory: ${this.calRootDir}`);
    }

    this.setupCloudHandlers();
  }

  private setupCloudHandlers(): void {
    this.cloud.onMessage('CAL_DEPLOYMENT', async (message) => {
      console.log('[CAL] Received deployment notification:', message.targetId);
      this.enqueueDeployment(message as PendingDeployment);
    });

    this.cloud.onMessage('CAL_DEPLOYMENT_CHECK', async () => {
      console.log('[CAL] Cloud requested deployment check');
      await this.checkPendingDeployments();
    });
  }

  onUpdate(callback: UpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  private broadcastUpdate(event: CalUpdateEvent): void {
    for (const callback of this.updateCallbacks) {
      try {
        callback(event);
      } catch (err) {
        console.error('[CAL] Update callback error:', (err as Error).message);
      }
    }
  }

  isUpdating(): boolean {
    return this.currentDeployment !== null;
  }

  getCurrentUpdate(): { packageName: string; version: string } | null {
    if (!this.currentDeployment) return null;
    return {
      packageName: this.currentDeployment.packageName,
      version: this.currentDeployment.versionNumber,
    };
  }

  getScriptOutput(): string[] {
    return [...this.scriptOutput];
  }

  getCalRootDir(): string {
    return this.calRootDir;
  }

  async start(): Promise<void> {
    console.log('[CAL] Starting CAL sync service');
    console.log(`[CAL] Root directory: ${this.calRootDir}`);
    
    await this.checkPendingDeployments();

    this.checkInterval = setInterval(() => {
      this.checkPendingDeployments().catch(err => {
        console.error('[CAL] Periodic check failed:', err.message);
      });
    }, 5 * 60 * 1000);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkPendingDeployments(): Promise<void> {
    if (!this.cloud.isConnected()) {
      if (!this.lastCloudDisconnectLogged) {
        console.log('[CAL] Cloud not connected, skipping deployment check (will suppress until reconnect)');
        this.lastCloudDisconnectLogged = true;
      }
      return;
    }

    if (this.lastCloudDisconnectLogged) {
      console.log('[CAL] Cloud reconnected, resuming deployment checks');
      this.lastCloudDisconnectLogged = false;
    }

    try {
      const deployments = await this.cloud.get<PendingDeployment[]>(
        `/api/service-hosts/${this.serviceHostId}/pending-deployments`
      );

      console.log(`[CAL] Found ${deployments.length} pending deployment(s)`);

      for (const deployment of deployments) {
        this.enqueueDeployment(deployment);
      }
    } catch (err) {
      console.error('[CAL] Failed to check pending deployments:', (err as Error).message);
    }
  }

  private enqueueDeployment(deployment: PendingDeployment): void {
    if (this.currentlyProcessing.has(deployment.targetId)) {
      console.log(`[CAL] Skipping ${deployment.targetId}, already being processed`);
      return;
    }
    
    if (this.successfullyCompleted.has(deployment.targetId)) {
      console.log(`[CAL] Skipping ${deployment.targetId}, already successfully completed`);
      return;
    }
    
    const retryAfter = this.failedWithCooldown.get(deployment.targetId);
    if (retryAfter && Date.now() < retryAfter) {
      console.log(`[CAL] Skipping ${deployment.targetId}, in cooldown until ${new Date(retryAfter).toISOString()}`);
      return;
    }
    
    const alreadyQueued = this.deploymentQueue.some(d => d.targetId === deployment.targetId);
    if (!alreadyQueued) {
      this.deploymentQueue.push(deployment);
      console.log(`[CAL] Queued deployment: ${deployment.packageName} v${deployment.versionNumber}`);
      this.startWorker();
    }
  }

  private startWorker(): void {
    if (this.workerRunning) {
      return;
    }
    this.workerRunning = true;
    this.runWorker();
  }

  private async runWorker(): Promise<void> {
    while (this.deploymentQueue.length > 0) {
      const deployment = this.deploymentQueue.shift()!;
      
      this.currentlyProcessing.add(deployment.targetId);
      this.currentDeployment = deployment;
      this.scriptOutput = [];
      
      let success = false;
      try {
        console.log(`[CAL] Processing deployment: ${deployment.packageName} v${deployment.versionNumber}`);
        
        this.broadcastUpdate({
          type: 'CAL_UPDATE_STATUS',
          status: 'starting',
          packageName: deployment.packageName,
          packageVersion: deployment.versionNumber,
          message: 'Starting package installation...',
        });
        
        await this.processDeployment(deployment);
        success = true;
      } catch (err) {
        console.error(`[CAL] Worker error processing ${deployment.targetId}:`, (err as Error).message);
        
        this.broadcastUpdate({
          type: 'CAL_UPDATE_STATUS',
          status: 'failed',
          packageName: deployment.packageName,
          packageVersion: deployment.versionNumber,
          message: (err as Error).message,
          logOutput: this.scriptOutput.join('\n'),
        });
      } finally {
        this.currentlyProcessing.delete(deployment.targetId);
        this.currentDeployment = null;
        
        if (success) {
          this.successfullyCompleted.add(deployment.targetId);
          this.failedWithCooldown.delete(deployment.targetId);
          
          this.broadcastUpdate({
            type: 'CAL_UPDATE_STATUS',
            status: 'completed',
            packageName: deployment.packageName,
            packageVersion: deployment.versionNumber,
            message: 'Installation completed successfully',
            logOutput: this.scriptOutput.join('\n'),
          });
        } else {
          const existingCooldown = this.failedWithCooldown.get(deployment.targetId);
          const previousDelay = existingCooldown 
            ? existingCooldown - Date.now() + CalSync.INITIAL_RETRY_DELAY_MS 
            : 0;
          const newDelay = Math.min(
            Math.max(previousDelay * 2, CalSync.INITIAL_RETRY_DELAY_MS),
            CalSync.MAX_RETRY_DELAY_MS
          );
          this.failedWithCooldown.set(deployment.targetId, Date.now() + newDelay);
          console.log(`[CAL] Deployment ${deployment.targetId} failed, retry after ${newDelay / 1000}s`);
        }
      }
    }
    
    this.workerRunning = false;
    console.log('[CAL] Worker finished, queue empty');
  }

  private async processDeployment(deployment: PendingDeployment): Promise<void> {
    try {
      await this.updateStatus(deployment.targetId, 'downloading', 'Starting download...');

      if (deployment.action === 'install' || deployment.action === 'update' || deployment.action === 'reinstall') {
        await this.installPackage(deployment);
      } else if (deployment.action === 'uninstall' || deployment.action === 'remove') {
        await this.uninstallPackage(deployment);
      } else {
        throw new Error(`Unknown action: ${deployment.action}`);
      }

      await this.updateStatus(deployment.targetId, 'completed', 'Installation successful');
      console.log(`[CAL] Deployment completed: ${deployment.packageName} v${deployment.versionNumber}`);

    } catch (err) {
      const message = (err as Error).message;
      console.error(`[CAL] Deployment failed: ${message}`);
      await this.updateStatus(deployment.targetId, 'failed', message);
      throw err;
    }
  }

  private async installPackage(deployment: PendingDeployment): Promise<void> {
    const packageDir = path.join(this.packagesDir, deployment.packageType, deployment.packageName.replace(/\s+/g, '-'));
    
    if (!fs.existsSync(packageDir)) {
      fs.mkdirSync(packageDir, { recursive: true });
    }

    if (deployment.downloadUrl) {
      this.broadcastUpdate({
        type: 'CAL_UPDATE_STATUS',
        status: 'downloading',
        packageName: deployment.packageName,
        packageVersion: deployment.versionNumber,
        message: 'Downloading package...',
        progress: 10,
      });
      
      await this.updateStatus(deployment.targetId, 'downloading', 'Downloading package...');
      
      const fileName = `${deployment.packageName.replace(/\s+/g, '-')}-${deployment.versionNumber}.tar.gz`;
      const filePath = path.join(packageDir, fileName);

      await this.downloadFile(deployment.downloadUrl, filePath);

      if (deployment.checksum) {
        const valid = await this.verifyChecksum(filePath, deployment.checksum);
        if (!valid) {
          fs.unlinkSync(filePath);
          throw new Error('Checksum verification failed');
        }
      }

      this.broadcastUpdate({
        type: 'CAL_UPDATE_STATUS',
        status: 'installing',
        packageName: deployment.packageName,
        packageVersion: deployment.versionNumber,
        message: 'Extracting package...',
        progress: 40,
      });
      
      await this.updateStatus(deployment.targetId, 'installing', 'Extracting package...');
      await this.extractPackage(filePath, packageDir);

      await this.runStartupScript(deployment, packageDir);

    } else {
      await this.updateStatus(deployment.targetId, 'installing', 'Registering package...');
    }

    this.recordInstalledPackage(deployment);

    console.log(`[CAL] Installed: ${deployment.packageName} v${deployment.versionNumber}`);
  }

  private async runStartupScript(deployment: PendingDeployment, packageDir: string): Promise<void> {
    const isWindows = process.platform === 'win32';
    
    const scriptCandidates = isWindows
      ? ['install.ps1', 'install.bat', 'setup.ps1', 'setup.bat']
      : ['install.sh', 'setup.sh'];
    
    let scriptPath: string | null = null;
    let scriptType: 'powershell' | 'batch' | 'shell' = 'shell';
    
    for (const scriptName of scriptCandidates) {
      const candidatePath = path.join(packageDir, scriptName);
      if (fs.existsSync(candidatePath)) {
        scriptPath = candidatePath;
        if (scriptName.endsWith('.ps1')) {
          scriptType = 'powershell';
        } else if (scriptName.endsWith('.bat')) {
          scriptType = 'batch';
        } else {
          scriptType = 'shell';
        }
        break;
      }
    }
    
    if (!scriptPath) {
      console.log('[CAL] No startup script found, skipping script execution');
      this.addScriptOutput('[CAL] No startup script found in package');
      return;
    }
    
    console.log(`[CAL] Found startup script: ${scriptPath}`);
    this.addScriptOutput(`[CAL] Running startup script: ${path.basename(scriptPath)}`);
    
    this.broadcastUpdate({
      type: 'CAL_UPDATE_STATUS',
      status: 'running_script',
      packageName: deployment.packageName,
      packageVersion: deployment.versionNumber,
      message: `Running ${path.basename(scriptPath)}...`,
      progress: 60,
    });
    
    await this.updateStatus(deployment.targetId, 'installing', `Running ${path.basename(scriptPath)}...`);
    
    const env = {
      ...process.env,
      CAL_ROOT_DIR: this.calRootDir,
      CAL_PACKAGE_NAME: deployment.packageName,
      CAL_PACKAGE_VERSION: deployment.versionNumber,
      CAL_PACKAGE_TYPE: deployment.packageType,
      CAL_PACKAGE_DIR: packageDir,
      CAL_SERVICE_HOST_ID: this.serviceHostId,
    };
    
    try {
      if (scriptType === 'powershell') {
        await this.runPowerShellScript(scriptPath, env);
      } else if (scriptType === 'batch') {
        await this.runBatchScript(scriptPath, env);
      } else {
        await this.runShellScript(scriptPath, env);
      }
      
      this.addScriptOutput('[CAL] Startup script completed successfully');
      console.log('[CAL] Startup script completed');
      
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.addScriptOutput(`[CAL] Script error: ${errorMsg}`);
      console.error('[CAL] Startup script failed:', errorMsg);
      throw new Error(`Startup script failed: ${errorMsg}`);
    }
  }
  
  private async runPowerShellScript(scriptPath: string, env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-CalRootDir', this.calRootDir,
      ], {
        cwd: path.dirname(scriptPath),
        env,
        shell: false,
      });
      
      ps.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(line.trim());
          }
        }
      });
      
      ps.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(`[ERROR] ${line.trim()}`);
          }
        }
      });
      
      ps.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`PowerShell script exited with code ${code}`));
        }
      });
      
      ps.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  private async runBatchScript(scriptPath: string, env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const bat = spawn('cmd.exe', ['/c', scriptPath, this.calRootDir], {
        cwd: path.dirname(scriptPath),
        env,
        shell: false,
      });
      
      bat.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(line.trim());
          }
        }
      });
      
      bat.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(`[ERROR] ${line.trim()}`);
          }
        }
      });
      
      bat.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Batch script exited with code ${code}`));
        }
      });
      
      bat.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  private async runShellScript(scriptPath: string, env: NodeJS.ProcessEnv): Promise<void> {
    await execAsync(`chmod +x "${scriptPath}"`);
    
    return new Promise((resolve, reject) => {
      const sh = spawn('bash', [scriptPath, this.calRootDir], {
        cwd: path.dirname(scriptPath),
        env,
        shell: false,
      });
      
      sh.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(line.trim());
          }
        }
      });
      
      sh.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            this.addScriptOutput(`[ERROR] ${line.trim()}`);
          }
        }
      });
      
      sh.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Shell script exited with code ${code}`));
        }
      });
      
      sh.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  private addScriptOutput(line: string): void {
    this.scriptOutput.push(line);
    console.log(`[CAL SCRIPT] ${line}`);
    
    if (this.currentDeployment) {
      this.broadcastUpdate({
        type: 'CAL_UPDATE_STATUS',
        status: 'running_script',
        packageName: this.currentDeployment.packageName,
        packageVersion: this.currentDeployment.versionNumber,
        message: line,
        logOutput: this.scriptOutput.join('\n'),
      });
    }
  }

  private async uninstallPackage(deployment: PendingDeployment): Promise<void> {
    const packageDir = path.join(this.packagesDir, deployment.packageType, deployment.packageName.replace(/\s+/g, '-'));
    
    const uninstallScripts = process.platform === 'win32'
      ? ['uninstall.ps1', 'uninstall.bat']
      : ['uninstall.sh'];
    
    for (const scriptName of uninstallScripts) {
      const scriptPath = path.join(packageDir, scriptName);
      if (fs.existsSync(scriptPath)) {
        console.log(`[CAL] Running uninstall script: ${scriptPath}`);
        try {
          if (scriptName.endsWith('.ps1')) {
            await this.runPowerShellScript(scriptPath, process.env);
          } else if (scriptName.endsWith('.bat')) {
            await this.runBatchScript(scriptPath, process.env);
          } else {
            await this.runShellScript(scriptPath, process.env);
          }
        } catch (err) {
          console.warn(`[CAL] Uninstall script failed: ${(err as Error).message}`);
        }
        break;
      }
    }
    
    if (fs.existsSync(packageDir)) {
      fs.rmSync(packageDir, { recursive: true, force: true });
    }

    this.removeInstalledPackage(deployment.packageName);

    console.log(`[CAL] Uninstalled: ${deployment.packageName}`);
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    let buffer: ArrayBuffer;
    
    if (url.startsWith('/')) {
      buffer = await this.cloud.downloadFile(url);
    } else if (url.startsWith(this.cloud.getCloudUrl())) {
      const endpoint = url.replace(this.cloud.getCloudUrl(), '');
      buffer = await this.cloud.downloadFile(endpoint);
    } else {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      buffer = await response.arrayBuffer();
    }

    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`[CAL] Downloaded: ${destPath}`);
  }

  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    const crypto = await import('crypto');
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    return hash === expectedChecksum;
  }

  private async extractPackage(archivePath: string, destDir: string): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
      } else {
        await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
      }
      console.log(`[CAL] Extracted: ${archivePath}`);
    } catch (err) {
      console.error(`[CAL] tar extraction failed: ${(err as Error).message}`);
      throw new Error(`Package extraction failed: ${(err as Error).message}`);
    }
  }

  private recordInstalledPackage(deployment: PendingDeployment): void {
    const manifest = this.loadManifest();
    
    manifest.packages[deployment.packageName] = {
      version: deployment.versionNumber,
      type: deployment.packageType,
      installedAt: new Date().toISOString(),
      deploymentId: deployment.deploymentId,
    };

    this.saveManifest(manifest);
  }

  private removeInstalledPackage(packageName: string): void {
    const manifest = this.loadManifest();
    delete manifest.packages[packageName];
    this.saveManifest(manifest);
  }

  private loadManifest(): { packages: Record<string, any> } {
    const manifestPath = path.join(this.packagesDir, 'manifest.json');
    
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        return { packages: {} };
      }
    }
    
    return { packages: {} };
  }

  private saveManifest(manifest: { packages: Record<string, any> }): void {
    const manifestPath = path.join(this.packagesDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async updateStatus(targetId: string, status: string, message: string): Promise<void> {
    console.log(`[CAL] Status update: ${status} - ${message}`);
    
    try {
      await this.cloud.post(`/api/cal-deployment-targets/${targetId}/status`, {
        status,
        statusMessage: message,
      });
    } catch (err) {
      console.error('[CAL] Failed to update status on cloud:', (err as Error).message);
      throw err;
    }
  }

  getInstalledPackages(): Record<string, any> {
    return this.loadManifest().packages;
  }
}
