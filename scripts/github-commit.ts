import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function retry<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  for (let i = 0; i <= max; i++) {
    try { return await fn(); } catch (e: any) {
      if (i === max) throw e;
      if (e.status === 403 || e.status === 429) { await sleep(Math.pow(2, i) * 2000 + Math.random() * 1000); }
      else throw e;
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });

  const part1 = JSON.parse(fs.readFileSync('/tmp/github-blobs-part1.json', 'utf-8'));
  const part2 = JSON.parse(fs.readFileSync('/tmp/github-blobs-part2.json', 'utf-8'));
  const allItems = [...part1, ...part2];
  console.log(`Combining ${part1.length} + ${part2.length} = ${allItems.length} tree items`);

  console.log('Creating tree...');
  const { data: tree } = await retry(() =>
    octokit.git.createTree({ owner: OWNER, repo: REPO, tree: allItems })
  );
  console.log(`Tree SHA: ${tree.sha}`);

  const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: 'heads/main' });

  console.log('Creating commit...');
  const { data: commit } = await retry(() =>
    octokit.git.createCommit({
      owner: OWNER, repo: REPO,
      message: 'Cloud POS V3.0 - Full system upload\n\nComplete source code including:\n- React/TypeScript frontend (client/)\n- Express/Node.js backend (server/)\n- Shared schema and types (shared/)\n- Service-host offline system (service-host/)\n- Electron Windows wrapper (electron/)\n- Database migrations and configuration\n- Documentation and reference files',
      tree: tree.sha,
      parents: [ref.object.sha],
    })
  );
  console.log(`Commit SHA: ${commit.sha}`);

  console.log('Updating main branch...');
  await retry(() =>
    octokit.git.updateRef({ owner: OWNER, repo: REPO, ref: 'heads/main', sha: commit.sha, force: true })
  );

  console.log(`\nSUCCESS! ${allItems.length} files pushed to https://github.com/${OWNER}/${REPO}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
