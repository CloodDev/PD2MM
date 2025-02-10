import pkg from './package.json' with {type: 'json'};
import mapWorkspaces from '@npmcli/map-workspaces';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export default /** @type import('electron-builder').Configuration */
({
  directories: {
    output: 'dist',
    buildResources: 'buildResources',
  },
  generateUpdatesFilesForAllChannels: true,
  linux: {
    target: ['deb'],
  },
  win: {
    target: [{
      target: 'msi',
      arch: ['x64', 'ia32']
    }]
  },
  /**
   * It is recommended to avoid using non-standard characters such as spaces in artifact names,
   * as they can unpredictably change during deployment, making them impossible to locate and download for update.
   */
  artifactName: 'PD2MM-${version}-${os}.${ext}',
  files: [
    'LICENSE*',
    'packages/entry-point.js',
    '!node_modules/@vite-electron-builder/**',
    ...await getListOfFilesFromEachWorkspace(),
  ],
});

async function getListOfFilesFromEachWorkspace() {

  /**
   * @type {Map<string, string>}
   */
  const workspaces = await mapWorkspaces({
    cwd: process.cwd(),
    pkg,
  });

  const allFilesToInclude = [];

  for (const [name, path] of workspaces) {
    const pkgPath = join(path, 'package.json');
    const {default: workspacePkg} = await import(pathToFileURL(pkgPath), {with: {type: 'json'}});

    let patterns = workspacePkg.files || ['dist/**', 'package.json'];

    patterns = patterns.map(p => join('node_modules', name, p));
    allFilesToInclude.push(...patterns);
  }

  return allFilesToInclude;
}
