import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

console.log('[deploy:pages] 1/3 构建 GitHub Pages 产物 (base=/modern-survival-guide/)...');
execSync('npm run build:pages', { cwd: rootDir, stdio: 'inherit' });

const indexHtml = path.join(distDir, 'index.html');
const fallback404 = path.join(distDir, '404.html');
const noJekyll = path.join(distDir, '.nojekyll');
fs.copyFileSync(indexHtml, fallback404);
if (!fs.existsSync(noJekyll)) {
  fs.writeFileSync(noJekyll, '');
}

const remoteUrl = execSync('git remote get-url origin', {
  cwd: rootDir,
  encoding: 'utf8',
}).trim();

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-pages-'));
try {
  console.log('[deploy:pages] 2/3 准备 gh-pages 分支提交...');
  fs.cpSync(distDir, tempDir, { recursive: true });
  execSync('git init', { cwd: tempDir, stdio: 'inherit' });
  execSync('git checkout -b gh-pages', { cwd: tempDir, stdio: 'inherit' });
  execSync('git add -A', { cwd: tempDir, stdio: 'inherit' });
  execSync('git commit -m "chore(pages): deploy modern-survival-guide"', {
    cwd: tempDir,
    stdio: 'inherit',
  });
  execSync(`git remote add origin "${remoteUrl}"`, { cwd: tempDir, stdio: 'inherit' });
  console.log('[deploy:pages] 3/3 推送至 origin/gh-pages...');
  execSync('git push -f origin gh-pages', { cwd: tempDir, stdio: 'inherit' });
  console.log('[deploy:pages] 推送完成！');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
