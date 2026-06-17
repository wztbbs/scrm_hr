#!/usr/bin/env node
/**
 * Build and package the Chrome extension for test or production environment.
 *
 * Usage:
 *   node build-extension.js test
 *   node build-extension.js prod
 *   node build-extension.js test --keep   # keep temp build dir for debugging
 *
 * Outputs:
 *   - extension-test.zip  (test environment: localhost:8080, name suffix "(Test)")
 *   - extension-prod.zip  (production environment: api.hrscrm.net)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const SOURCE_DIR = path.join(PROJECT_ROOT, 'extension');

const CONFIGS = {
  test: {
    apiBase: 'http://localhost:8080',
    checkoutBase: 'http://localhost:8080',
    hostPermission: 'http://localhost:8080/*',
    nameSuffix: ' (Test)',
    outputFile: 'extension-test.zip',
  },
  prod: {
    apiBase: 'https://api.hrscrm.net',
    checkoutBase: 'https://www.hrscrm.net',
    hostPermission: 'https://api.hrscrm.net/*',
    nameSuffix: '',
    outputFile: 'extension-prod.zip',
  },
};

function log(...args) {
  console.log('[build-extension]', ...args);
}

function errorExit(message) {
  console.error('[build-extension] ERROR:', message);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const envArg = args.find(a => !a.startsWith('--'));
  const keep = args.includes('--keep');
  const env = envArg || 'prod';
  if (!CONFIGS[env]) {
    errorExit(`Unknown environment "${env}". Use "test" or "prod".`);
  }
  return { env, keep };
}

function ensureZipCommand() {
  try {
    execFileSync('which', ['zip']);
  } catch (e) {
    errorExit('The "zip" command is required but not found. Please install it (e.g. `brew install zip`).');
  }
}

function ensureSourceDir() {
  if (!fs.existsSync(SOURCE_DIR)) {
    errorExit(`Source directory not found: ${SOURCE_DIR}`);
  }
  if (!fs.statSync(SOURCE_DIR).isDirectory()) {
    errorExit(`Source path is not a directory: ${SOURCE_DIR}`);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copySourceToBuild(buildDir) {
  cleanDir(buildDir);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.cpSync(SOURCE_DIR, buildDir, {
    recursive: true,
    filter: (src) => {
      const basename = path.basename(src);
      // Skip macOS metadata files
      return basename !== '.DS_Store';
    },
  });
}

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [pattern, replacement] of replacements) {
    if (typeof pattern === 'string') {
      if (!content.includes(pattern)) {
        console.warn(`  Warning: pattern not found in ${path.basename(filePath)}: ${pattern}`);
        continue;
      }
      content = content.split(pattern).join(replacement);
      changed = true;
    } else {
      if (!pattern.test(content)) {
        console.warn(`  Warning: regex not matched in ${path.basename(filePath)}: ${pattern}`);
        continue;
      }
      content = content.replace(pattern, replacement);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function applyApiBase(filePath, apiBase) {
  replaceInFile(filePath, [
    [/const\s+DEFAULT_API_BASE\s*=\s*'[^']*';/, `const DEFAULT_API_BASE = '${apiBase}';`],
  ]);
}

function applyManifest(filePath, config) {
  const content = fs.readFileSync(filePath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch (e) {
    errorExit(`Failed to parse ${filePath}: ${e.message}`);
  }

  if (!Array.isArray(manifest.host_permissions) || manifest.host_permissions.length === 0) {
    errorExit('manifest.json missing host_permissions');
  }
  manifest.host_permissions = [config.hostPermission];

  // Strip existing known suffix, then add the correct one
  const baseName = (manifest.name || '').replace(/ \(Test\)$/, '');
  manifest.name = baseName + config.nameSuffix;

  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function applyPopupCheckout(filePath, checkoutBase) {
  replaceInFile(filePath, [
    [/https?:\/\/[^`]+?\/checkout\.html/, `${checkoutBase}/checkout.html`],
  ]);
}

function applyDebugSwitch(buildDir, env) {
  if (env !== 'prod') return;
  const files = ['content.js', 'background.js'];
  for (const file of files) {
    const filePath = path.join(buildDir, file);
    if (!fs.existsSync(filePath)) continue;
    replaceInFile(filePath, [
      [/const\s+DEBUG\s*=\s*true\s*;/, 'const DEBUG = false;'],
    ]);
  }
}

function verifyFiles(buildDir, config) {
  const apiJs = fs.readFileSync(path.join(buildDir, 'api.js'), 'utf8');
  const bgJs = fs.readFileSync(path.join(buildDir, 'background.js'), 'utf8');
  const popupJs = fs.readFileSync(path.join(buildDir, 'popup.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'manifest.json'), 'utf8'));

  const checks = [
    [apiJs.includes(`'${config.apiBase}'`), 'api.js DEFAULT_API_BASE'],
    [bgJs.includes(`'${config.apiBase}'`), 'background.js DEFAULT_API_BASE'],
    [popupJs.includes(`${config.checkoutBase}/checkout.html`), 'popup.js checkout URL'],
    [manifest.host_permissions[0] === config.hostPermission, 'manifest.json host_permissions'],
    [manifest.name.endsWith(config.nameSuffix), 'manifest.json name suffix'],
  ];

  for (const [ok, label] of checks) {
    if (!ok) {
      errorExit(`Verification failed: ${label}`);
    }
  }
}

function zipBuildDir(buildDir, outputFile) {
  const outputPath = path.join(PROJECT_ROOT, outputFile);
  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath);
  }
  log(`Creating ${outputFile} ...`);
  execFileSync('zip', ['-r', outputPath, '.'], {
    cwd: buildDir,
    stdio: 'inherit',
  });
}

function main() {
  const { env, keep } = parseArgs();
  const config = CONFIGS[env];

  log(`Building for environment: ${env}`);
  ensureZipCommand();
  ensureSourceDir();

  const buildDir = path.join(PROJECT_ROOT, 'build', `extension-${env}`);
  copySourceToBuild(buildDir);

  applyApiBase(path.join(buildDir, 'api.js'), config.apiBase);
  applyApiBase(path.join(buildDir, 'background.js'), config.apiBase);
  applyManifest(path.join(buildDir, 'manifest.json'), config);
  applyPopupCheckout(path.join(buildDir, 'popup.js'), config.checkoutBase);
  applyDebugSwitch(buildDir, env);

  verifyFiles(buildDir, config);
  log('Verification passed.');

  zipBuildDir(buildDir, config.outputFile);

  if (!keep) {
    cleanDir(path.join(PROJECT_ROOT, 'build'));
  } else {
    log(`Temp build dir kept at: ${buildDir}`);
  }

  log(`Done: ${config.outputFile}`);
}

main();
