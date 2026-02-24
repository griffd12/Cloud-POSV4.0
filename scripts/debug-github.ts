import { Octokit } from '@octokit/rest';

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
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) throw new Error('GitHub not connected');
  return accessToken;
}

async function main() {
  const octokit = new Octokit({ auth: await getAccessToken() });

  console.log('--- Repo info ---');
  const { data: repo } = await octokit.repos.get({ owner: OWNER, repo: REPO });
  console.log(`Size: ${repo.size}, Default branch: ${repo.default_branch}, Empty: ${repo.size === 0}`);

  console.log('\n--- Try get ref ---');
  try {
    const { data: ref } = await octokit.git.getRef({ owner: OWNER, repo: REPO, ref: 'heads/main' });
    console.log(`Ref: ${ref.ref}, SHA: ${ref.object.sha}`);

    const { data: commit } = await octokit.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: ref.object.sha });
    console.log(`Commit message: ${commit.message}`);
    console.log(`Tree SHA: ${commit.tree.sha}`);
  } catch (e: any) {
    console.log(`Error: ${e.status} ${e.message}`);
  }

  console.log('\n--- Try list contents ---');
  try {
    const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: '' });
    if (Array.isArray(data)) {
      console.log(`Files in root: ${data.map((f: any) => f.name).join(', ')}`);
    }
  } catch (e: any) {
    console.log(`Error: ${e.status} ${e.message}`);
  }

  console.log('\n--- Try create simple tree ---');
  try {
    const { data: blob } = await octokit.git.createBlob({
      owner: OWNER, repo: REPO, content: 'test', encoding: 'utf-8'
    });
    console.log(`Test blob SHA: ${blob.sha}`);

    const { data: tree } = await octokit.git.createTree({
      owner: OWNER, repo: REPO,
      tree: [{ path: 'test.txt', mode: '100644', type: 'blob', sha: blob.sha }],
    });
    console.log(`Test tree SHA: ${tree.sha}`);
  } catch (e: any) {
    console.log(`Error: ${e.status} ${e.message}`);
  }

  console.log('\n--- Check permissions ---');
  try {
    const { data: perms } = await octokit.repos.getCollaboratorPermissionLevel({
      owner: OWNER, repo: REPO, username: (await octokit.users.getAuthenticated()).data.login,
    });
    console.log(`Permission: ${perms.permission}`);
  } catch (e: any) {
    console.log(`Error checking perms: ${e.message}`);
  }
}

main().catch(console.error);
