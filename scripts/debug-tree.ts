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

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });
  const baseDir = process.cwd();

  const testFiles = ['package.json', 'tsconfig.json', 'replit.md', 'tailwind.config.ts', 'vite.config.ts'];
  const items: any[] = [];

  for (const f of testFiles) {
    const fullPath = path.join(baseDir, f);
    if (!fs.existsSync(fullPath)) { console.log(`Skip ${f}`); continue; }
    const content = fs.readFileSync(fullPath, 'utf-8');
    const { data: blob } = await octokit.git.createBlob({ owner: OWNER, repo: REPO, content, encoding: 'utf-8' });
    items.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`Blob: ${f} -> ${blob.sha.slice(0,8)}`);
  }

  console.log(`\nCreating tree with ${items.length} items...`);
  try {
    const { data: tree } = await octokit.git.createTree({ owner: OWNER, repo: REPO, tree: items });
    console.log(`Tree OK: ${tree.sha}`);
  } catch (e: any) {
    console.log(`Tree FAILED: ${e.status} ${e.message}`);
    console.log(`Response: ${JSON.stringify(e.response?.data)}`);
  }

  console.log(`\nTrying with base_tree...`);
  const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: 'heads/main' });
  const { data: parentCommit } = await octokit.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: ref.object.sha });
  try {
    const { data: tree } = await octokit.git.createTree({
      owner: OWNER, repo: REPO, tree: items, base_tree: parentCommit.tree.sha
    });
    console.log(`Tree with base OK: ${tree.sha}`);
  } catch (e: any) {
    console.log(`Tree with base FAILED: ${e.status} ${e.message}`);
    console.log(`Response: ${JSON.stringify(e.response?.data)}`);
  }
}

main().catch(console.error);
