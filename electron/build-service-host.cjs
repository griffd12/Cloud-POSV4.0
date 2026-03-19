const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const entryPoint = path.join(__dirname, '..', 'service-host', 'src', 'index.ts');
const outFile = path.join(__dirname, 'service-host-embedded.cjs');

if (!fs.existsSync(entryPoint)) {
  console.error(`[build-service-host] Entry point not found: ${entryPoint}`);
  process.exit(1);
}

console.log('[build-service-host] Bundling service-host TypeScript -> CJS...');
console.log(`  Entry: ${entryPoint}`);
console.log(`  Output: ${outFile}`);

try {
  execSync(
    [
      'npx esbuild',
      `"${entryPoint}"`,
      '--bundle',
      `--outfile="${outFile}"`,
      '--format=cjs',
      '--platform=node',
      '--target=node20',
      '--external:better-sqlite3',
      '--external:keytar',
      '--external:serialport',
      '--external:@serialport/*',
      '--external:electron',
      '--define:import.meta.url=__filename',
      '--sourcemap=inline',
      '--log-level=info',
    ].join(' '),
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
  );

  if (fs.existsSync(outFile)) {
    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`[build-service-host] Bundle created: ${outFile} (${sizeKB} KB)`);

    let content = fs.readFileSync(outFile, 'utf8');
    // Strip shebang lines — they cause SyntaxError inside Electron's asar archive
    content = content.replace(/^#!.*\r?\n/gm, '');
    console.log('[build-service-host] Stripped shebang lines from bundle');

    // Fix ESM→CJS __dirname shim: esbuild replaces import.meta.url with __filename,
    // but fileURLToPath(__filename) throws ERR_INVALID_URL_SCHEME because __filename
    // is already a plain path, not a file:// URL. Replace with direct path usage.
    let fixCount = 0;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('fileURLToPath') && lines[i].includes('__filename')) {
        lines[i] = lines[i]
          .replace(/[a-zA-Z_$][\w$]*\.default\.dirname\(\(0, [a-zA-Z_$][\w$]*\.fileURLToPath\)\(__filename\)\)/g, '__dirname')
          .replace(/\(0, [a-zA-Z_$][\w$]*\.fileURLToPath\)\(__filename\)/g, '__filename');
        fixCount++;
      }
    }
    content = lines.join('\n');
    console.log(`[build-service-host] Fixed fileURLToPath(__filename) patterns: ${fixCount} lines`);

    const buildInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8'));
    const envBootstrap = `
// Embedded service-host bootstrap: read config from environment variables
process.env.CAPS_VERSION = process.env.CAPS_VERSION || '${buildInfo.version}';
process.env.CAPS_BUILD_DATE = process.env.CAPS_BUILD_DATE || '${buildInfo.buildDate}';
if (process.env.SERVICE_HOST_PORT) {
  const _origArgv = process.argv;
  const _envArgs = ['node', 'service-host'];
  if (process.env.SERVICE_HOST_CLOUD_URL) _envArgs.push('--cloud', process.env.SERVICE_HOST_CLOUD_URL);
  if (process.env.SERVICE_HOST_ID) _envArgs.push('--service-host-id', process.env.SERVICE_HOST_ID);
  if (process.env.SERVICE_HOST_TOKEN) _envArgs.push('--token', process.env.SERVICE_HOST_TOKEN);
  if (process.env.SERVICE_HOST_PROPERTY_ID) _envArgs.push('--property', process.env.SERVICE_HOST_PROPERTY_ID);
  if (process.env.SERVICE_HOST_PORT) _envArgs.push('--port', process.env.SERVICE_HOST_PORT);
  if (process.env.SERVICE_HOST_DATA_DIR) _envArgs.push('--data-dir', process.env.SERVICE_HOST_DATA_DIR);
  process.argv = _envArgs;
}
`;
    content = envBootstrap + content;
    fs.writeFileSync(outFile, content);
    console.log('[build-service-host] Env bootstrap prepended');
  } else {
    console.error('[build-service-host] Bundle file not created');
    process.exit(1);
  }
} catch (e) {
  console.error('[build-service-host] Build failed:', e.message);
  process.exit(1);
}

console.log('[build-service-host] Done');
