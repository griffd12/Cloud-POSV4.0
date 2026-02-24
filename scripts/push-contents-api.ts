import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

const OWNER = 'griffd12';
const REPO = 'Cloud-pos-V3.0';
const START = parseInt(process.argv[2] || '0');
const COUNT = parseInt(process.argv[3] || '30');

let connectionSettings: any;
async function getAccessToken(): Promise<string> {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) throw new Error('X-Replit-Token not found');
  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken } }
  ).then((res) => res.json()).then((data) => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

const EXCLUDE_DIRS = ['.git', 'node_modules', '.local', '.config', '.cache', 'dist', '.upm', 'attached_assets', 'generated', '.nix-profile', '.nix-defexpr', 'scripts', 'uploads'];
const EXCLUDE_FILES = ['.replit', 'package-lock.json', '.replit.nix'];

function getAllFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) results.push(...getAllFiles(fullPath, baseDir));
    } else {
      if (!EXCLUDE_FILES.includes(entry.name) && !entry.name.endsWith('.lock')) results.push(relPath);
    }
  }
  return results;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  for (let i = 0; i <= max; i++) {
    try { return await fn(); } catch (e: any) {
      if (i === max) throw e;
      if (e.status === 403 || e.status === 429 || e.status === 409) {
        await sleep(Math.pow(2, i) * 2000 + Math.random() * 1000);
      } else throw e;
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });
  const baseDir = process.cwd();
  const allFiles = getAllFiles(baseDir, baseDir);
  const files = allFiles.slice(START, START + COUNT);
  console.log(`Total: ${allFiles.length}, uploading ${files.length} files (${START}-${START + files.length - 1})`);

  let success = 0, errors = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const fullPath = path.join(baseDir, filePath);
    try {
      const content = fs.readFileSync(fullPath).toString('base64');

      let sha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: filePath });
        if (!Array.isArray(data)) sha = data.sha;
      } catch {}

      await retry(() =>
        octokit.repos.createOrUpdateFileContents({
          owner: OWNER, repo: REPO, path: filePath,
          message: `Add ${filePath}`,
          content,
          ...(sha ? { sha } : {}),
        })
      );
      success++;
    } catch (e: any) {
      console.error(`  FAIL: ${filePath}: ${e.message}`);
      errors++;
    }

    if ((i + 1) % 10 === 0) console.log(`  ${i+1}/${files.length} (ok:${success} err:${errors})`);
    await sleep(300);
  }

  console.log(`DONE: ${success} uploaded, ${errors} failed (range ${START}-${START + files.length - 1})`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
