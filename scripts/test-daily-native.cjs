/* global __dirname */
// Run after Expo Android prebuild and assembleDebug/compileDebugKotlin.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const gradle = process.env.GRADLE_USER_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.gradle');
function jar(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jar')) return full;
    if (entry.isDirectory()) { const found = jar(full); if (found) return found; }
  }
}
const local = fs.readFileSync(path.join(root, 'android/local.properties'), 'utf8');
const sdk = local.match(/^sdk.dir=(.*)$/m)[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
const cache = path.join(gradle, 'caches/modules-2/files-2.1');
const classpath = [path.join(root, 'android/app/build/tmp/kotlin-classes/debug'),
  jar(path.join(cache, 'org.json/json')), jar(path.join(cache, 'org.jetbrains.kotlin/kotlin-stdlib/2.1.20')),
  path.join(sdk, 'platforms/android-36/android.jar')].join(path.delimiter);
const result = spawnSync('java', ['--class-path', classpath, path.join(__dirname, process.argv[2] || 'DailyAlarmRegression.java')], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
