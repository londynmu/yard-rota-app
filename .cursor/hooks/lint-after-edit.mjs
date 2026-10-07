import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const done = (payload = {}) => {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
};

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  done();
}

const toolInput = input.tool_input || input.toolInput || {};
const filePath = toolInput.path || toolInput.file_path || toolInput.target_file || input.file_path;
if (!filePath || !/\.(m?js|jsx)$/.test(filePath)) done();

const root = process.cwd();
const absolute = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
const relative = path.relative(root, absolute);
if (relative.startsWith('..') || !existsSync(absolute)) done();

const eslint = path.join(root, 'node_modules', '.bin', 'eslint');
if (!existsSync(eslint)) done();

try {
  execFileSync(eslint, ['--format', 'stylish', '--no-warn-ignored', relative], {
    cwd: root,
    encoding: 'utf8',
    timeout: 25000,
  });
  done();
} catch (err) {
  const output = `${err.stdout || ''}`.trim();
  if (!output) done();
  done({
    additional_context: `ESLint found problems in ${relative} after your edit. Fix them before continuing:\n${output}`,
  });
}
