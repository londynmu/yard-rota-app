/**
 * Patches Capacitor plugin build.gradle files to use proguard-android-optimize.txt
 * instead of the deprecated proguard-android.txt (required for AGP 9+).
 * Runs automatically via postinstall.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CAPACITOR_ROOT = 'node_modules/@capacitor';
const OLD = "getDefaultProguardFile('proguard-android.txt')";
const NEW = "getDefaultProguardFile('proguard-android-optimize.txt')";

function collectGradleFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectGradleFiles(fullPath));
      continue;
    }
    if (entry === 'build.gradle') {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectGradleFiles(CAPACITOR_ROOT);
let patched = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (!content.includes(OLD)) continue;

  writeFileSync(file, content.replaceAll(OLD, NEW), 'utf8');
  patched++;
  console.log(`[fix-proguard] Patched ${file}`);
}

if (patched === 0) {
  console.log('[fix-proguard] No files needed patching.');
}
