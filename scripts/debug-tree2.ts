import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

const OWNER = 'griffd12';
const REPO = 'Cloud-pos-V3.0';

let connectionSettings: any;
async function getAccessToken(): Promise<string> {
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
  return connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
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

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });
  const baseDir = process.cwd();
  const allFiles = getAllFiles(baseDir, baseDir);
  
  const COUNT = parseInt(process.argv[2] || '10');
  const files = allFiles.slice(0, COUNT);
  console.log(`Testing tree creation with ${files.length} files...`);

  const items: any[] = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(baseDir, f), 'utf-8');
    const { data: blob } = await octokit.git.createBlob({ owner: OWNER, repo: REPO, content, encoding: 'utf-8' });
    items.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
  }
  console.log(`Created ${items.length} blobs`);
  console.log(`Sample item:`, JSON.stringify(items[0]));

  const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: 'heads/main' });
  const { data: pc } = await octokit.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: ref.object.sha });

  console.log(`\nAttempt 1: createTree with base_tree`);
  try {
    const { data: tree } = await octokit.git.createTree({
      owner: OWNER, repo: REPO, tree: items, base_tree: pc.tree.sha,
    });
    console.log(`OK: ${tree.sha}`);
  } catch (e: any) {
    console.log(`FAIL: ${e.status} - ${JSON.stringify(e.response?.data)}`);
  }

  console.log(`\nAttempt 2: createTree without base_tree`);
  try {
    const { data: tree } = await octokit.git.createTree({
      owner: OWNER, repo: REPO, tree: items,
    });
    console.log(`OK: ${tree.sha}`);
  } catch (e: any) {
    console.log(`FAIL: ${e.status} - ${JSON.stringify(e.response?.data)}`);
  }

  console.log(`\nAttempt 3: raw fetch createTree`);
  const token = await getAccessToken();
  const resp = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ tree: items }),
  });
  console.log(`Status: ${resp.status}`);
  const body = await resp.text();
  console.log(`Body: ${body.slice(0, 500)}`);
}

main().catch(console.error);
