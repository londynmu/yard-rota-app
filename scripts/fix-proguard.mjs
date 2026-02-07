/**
 * Patches Capacitor plugin build.gradle files to use proguard-android-optimize.txt
 * instead of the deprecated proguard-android.txt (required for AGP 9+).
 * Runs automatically via postinstall.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const files = [
  'node_modules/@capacitor/android/capacitor/build.gradle',
  'node_modules/@capacitor/status-bar/android/build.gradle',
];

const OLD = "getDefaultProguardFile('proguard-android.txt')";
const NEW = "getDefaultProguardFile('proguard-android-optimize.txt')";

let patched = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  if (content.includes(OLD)) {
    writeFileSync(file, content.replace(OLD, NEW), 'utf8');
    patched++;
    console.log(`[fix-proguard] Patched ${file}`);
  }
}

if (patched === 0) {
  console.log('[fix-proguard] No files needed patching.');
}
