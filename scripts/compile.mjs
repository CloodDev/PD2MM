import { execFileSync, spawnSync } from 'node:child_process';

const platformTargets = {
  linux: '--linux',
  darwin: '--mac',
  win32: '--win',
};

const target = platformTargets[process.platform] ?? '--win';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['run', 'build']);
run('electron-builder', ['build', target, '--config', 'electron-builder.mjs']);
