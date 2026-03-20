import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = 'CloodDev/PD2MM';
const distDir = path.resolve('dist');

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCommandWithResult(command, args, options = {}) {
  return spawnSync(command, args, {
    shell: process.platform === 'win32',
    ...options,
  });
}

function getGhEnv() {
  const env = {...process.env};
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
}

function getGhToken() {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: getGhEnv(),
      shell: process.platform === 'win32',
    }).trim();

    if (!token) {
      throw new Error('Empty token from gh auth token');
    }

    return token;
  } catch {
    console.error('GitHub CLI auth token is not available. Run `gh auth login` first.');
    process.exit(1);
  }
}

function bumpVersion() {
  try {
    const bumpedVersion = execFileSync('npm', ['version', 'patch', '--no-git-tag-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
    }).trim();

    return bumpedVersion.startsWith('v') ? bumpedVersion.slice(1) : bumpedVersion;
  } catch {
    console.error('Failed to bump package version.');
    process.exit(1);
  }
}

const version = bumpVersion();
const tag = `v${version}`;
const ghToken = getGhToken();

function getAuthenticatedGhEnv() {
  return {
    ...getGhEnv(),
    GH_TOKEN: ghToken,
    GITHUB_TOKEN: ghToken,
  };
}

function fileMustExist(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Expected build artifact is missing: ${filePath}`);
    process.exit(1);
  }
}

function getReleaseAssetNames() {
  const result = runCommandWithResult('gh', ['release', 'view', tag, '--repo', repo, '--json', 'assets'], {
    env: getAuthenticatedGhEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed.assets) ? parsed.assets.map(asset => asset.name) : [];
  } catch {
    return [];
  }
}

function releaseExists() {
  return runCommandWithResult('gh', ['release', 'view', tag, '--repo', repo], {
    stdio: 'ignore',
    env: getAuthenticatedGhEnv(),
  }).status === 0;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForRelease(maxAttempts = 10, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (releaseExists()) {
      return;
    }

    sleep(delayMs);
  }

  console.error(`Release ${tag} was not found after creation attempts.`);
  process.exit(1);
}

function uploadAssetWithRetry(filePath, maxAttempts = 3) {
  const assetName = path.basename(filePath);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    runCommand('gh', ['release', 'upload', tag, filePath, '--repo', repo, '--clobber'], {env: getAuthenticatedGhEnv()});

    const assets = getReleaseAssetNames();
    if (assets.includes(assetName)) {
      return;
    }

    console.error(`Upload verification failed for ${assetName} (attempt ${attempt}/${maxAttempts}).`);
  }

  console.error(`Failed to verify upload for ${assetName}.`);
  process.exit(1);
}

runCommand('gh', ['auth', 'status'], {env: getAuthenticatedGhEnv()});
runCommand('npm', ['run', 'compile']);

const artifactExe = path.join(distDir, `PD2MM-${version}-win.exe`);
const artifactBlockmap = `${artifactExe}.blockmap`;
const latestYml = path.join(distDir, 'latest.yml');

fileMustExist(artifactExe);
fileMustExist(artifactBlockmap);
fileMustExist(latestYml);

if (!releaseExists()) {
  runCommand('gh', ['release', 'create', tag, '--repo', repo, '--title', tag, '--generate-notes'], {env: getAuthenticatedGhEnv()});
}

waitForRelease();

runCommand(
  'gh',
  ['release', 'view', tag, '--repo', repo],
  {env: getAuthenticatedGhEnv()},
);

uploadAssetWithRetry(artifactExe);
uploadAssetWithRetry(artifactBlockmap);
uploadAssetWithRetry(latestYml);
