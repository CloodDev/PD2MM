import { execFileSync } from 'node:child_process';

const releaseType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error(`Usage: node scripts/bump-version.mjs [patch|minor|major]`);
  process.exit(1);
}

const newVersion = execFileSync('npm', ['version', releaseType, '--no-git-tag-version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
}).trim();

console.log(`Bumped to ${newVersion}`);
