import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

const OWNER = 'griffd12';
const REPO = 'Cloud-pos-V3.0';

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

function isBinary(p: string): boolean {
  return ['.png','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.ttf','.eot','.otf','.zip','.tar','.gz','.pdf','.mp3','.mp4','.webp','.avif','.bmp','.svg'].includes(path.extname(p).toLowerCase());
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>, max = 8): Promise<T> {
  for (let i = 0; i <= max; i++) {
    try { return await fn(); } catch (e: any) {
      if (i === max) throw e;
      if (e.status === 403 || e.status === 429) { await sleep(Math.pow(2, i) * 1500 + Math.random() * 500); }
      else throw e;
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });
  
  const baseDir = process.cwd();
  const allFiles = getAllFiles(baseDir, baseDir);
  console.log(`Total files: ${allFiles.length}`);
  
  const BATCH = parseInt(process.argv[2] || '50');
  const START = parseInt(process.argv[3] || '0');
  const files = allFiles.slice(START, START + BATCH);
  console.log(`Batch: files ${START}-${START + files.length - 1} (${files.length} files)`);

  const treeItems: any[] = [];
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const fullPath = path.join(baseDir, filePath);
    try {
      const binary = isBinary(fullPath);
      const content = binary ? fs.readFileSync(fullPath).toString('base64') : fs.readFileSync(fullPath, 'utf-8');
      const { data: blob } = await retry(() =>
        octokit.git.createBlob({ owner: OWNER, repo: REPO, content, encoding: binary ? 'base64' : 'utf-8' })
      );
      treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
    } catch (e: any) {
      console.error(`  FAIL: ${filePath}`);
      errors++;
    }
  }

  console.log(`Blobs: ${treeItems.length}/${files.length}. Creating tree+commit...`);

  const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: 'heads/main' });
  const { data: parentCommit } = await octokit.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: ref.object.sha });

  const { data: tree } = await retry(() =>
    octokit.git.createTree({
      owner: OWNER, repo: REPO, tree: treeItems,
      base_tree: parentCommit.tree.sha,
    })
  );

  const { data: commit } = await retry(() =>
    octokit.git.createCommit({
      owner: OWNER, repo: REPO,
      message: `Upload files ${START}-${START + files.length - 1}`,
      tree: tree.sha,
      parents: [ref.object.sha],
    })
  );

  await retry(() =>
    octokit.git.updateRef({ owner: OWNER, repo: REPO, ref: 'heads/main', sha: commit.sha, force: true })
  );

  console.log(`DONE! ${treeItems.length} files committed. SHA: ${commit.sha.slice(0,8)}`);
  if (errors > 0) console.log(`${errors} files failed.`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
