import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = resolve(root, '..', 'desktop-agent', 'node_modules', 'typescript', 'bin', 'tsc');

await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await run(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json')], root);
await cp(resolve(root, 'public', 'manifest.json'), resolve(root, 'dist', 'manifest.json'));
await cp(resolve(root, 'public', 'options.html'), resolve(root, 'dist', 'options.html'));

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}
