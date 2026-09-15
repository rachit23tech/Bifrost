import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverFile = path.join(__dirname, 'server', 'index.ts');

const child = spawn(process.execPath, ['--import', 'tsx', serverFile], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (code !== null) process.exit(code);
  if (signal) process.kill(process.pid, signal);
});
