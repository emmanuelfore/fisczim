import { spawn } from 'child_process';
const child = spawn('npm', ['run', 'db:push'], { stdio: ['pipe', 'pipe', 'pipe'] });

child.stdout.on('data', (data) => {
  process.stdout.write(data);
  const str = data.toString();
  if (str.includes('created or renamed from another table')) {
    console.log('--- DETECTED PROMPT, SENDING ENTER ---');
    child.stdin.write('\r');
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log('Exited with', code);
  process.exit(code);
});
