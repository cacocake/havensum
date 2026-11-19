import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const k_repositoryRoot = resolve(import.meta.dirname, '..');
const k_projectInputs = ['app.json', 'package.json', 'index.native.js', 'assets', 'plugins'];
const k_prebuildTimeoutMilliseconds = 180000;
const k_expectedApplicationId = 'com.havensum.app';
const k_uploadKeyProperties = [
  'HAVENSUM_UPLOAD_STORE_FILE',
  'HAVENSUM_UPLOAD_STORE_PASSWORD',
  'HAVENSUM_UPLOAD_KEY_ALIAS',
  'HAVENSUM_UPLOAD_KEY_PASSWORD'
];
const k_removedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW'
];

function copyProjectInputs(targetDirectory) {
  for (const input of k_projectInputs) {
    cpSync(join(k_repositoryRoot, input), join(targetDirectory, input), { recursive: true });
  }
  symlinkSync(join(k_repositoryRoot, 'node_modules'), join(targetDirectory, 'node_modules'));
}

function runAndroidPrebuild(projectDirectory) {
  execFileSync('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: projectDirectory,
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
    stdio: 'pipe',
    timeout: k_prebuildTimeoutMilliseconds
  });
}

function readGeneratedFile(projectDirectory, relativePath) {
  return readFileSync(join(projectDirectory, 'android', relativePath), 'utf8');
}

function releaseBuildTypeBlock(appBuildGradle) {
  const buildTypesStart = appBuildGradle.indexOf('buildTypes {');
  const releaseStart = appBuildGradle.indexOf('release {', buildTypesStart);
  const packagingStart = appBuildGradle.indexOf('packagingOptions {', releaseStart);
  return appBuildGradle.slice(releaseStart, packagingStart);
}

test('the generated Android project uses the owner-approved package, version code, backup and permission settings', { timeout: k_prebuildTimeoutMilliseconds * 2 }, (context) => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'havensum-prebuild-'));
  context.after(() => rmSync(projectDirectory, { recursive: true, force: true }));
  copyProjectInputs(projectDirectory);
  const appConfig = JSON.parse(readFileSync(join(k_repositoryRoot, 'app.json'), 'utf8')).expo;

  runAndroidPrebuild(projectDirectory);

  const appBuildGradle = readGeneratedFile(projectDirectory, 'app/build.gradle');
  const manifest = readGeneratedFile(projectDirectory, 'app/src/main/AndroidManifest.xml');
  assert.match(appBuildGradle, new RegExp(`applicationId '${k_expectedApplicationId}'`));
  assert.ok(Number.isInteger(appConfig.android.versionCode) && appConfig.android.versionCode >= 1);
  assert.match(appBuildGradle, new RegExp(`versionCode ${appConfig.android.versionCode}\\b`));
  assert.match(appBuildGradle, new RegExp(`versionName "${appConfig.version}"`));
  assert.match(manifest, /android:allowBackup="false"/);
  for (const permission of k_removedPermissions) {
    assert.doesNotMatch(manifest, new RegExp(`uses-permission android:name="${permission}"/>`));
  }
});

test('a release package is signed only with the owner upload key named in Gradle properties, and prebuild is repeatable', { timeout: k_prebuildTimeoutMilliseconds * 3 }, (context) => {
  const projectDirectory = mkdtempSync(join(tmpdir(), 'havensum-prebuild-'));
  context.after(() => rmSync(projectDirectory, { recursive: true, force: true }));
  copyProjectInputs(projectDirectory);

  runAndroidPrebuild(projectDirectory);
  const appBuildGradle = readGeneratedFile(projectDirectory, 'app/build.gradle');
  runAndroidPrebuild(projectDirectory);

  assert.equal(readGeneratedFile(projectDirectory, 'app/build.gradle'), appBuildGradle);
  const releaseBlock = releaseBuildTypeBlock(appBuildGradle);
  assert.match(releaseBlock, /signingConfig signingConfigs\.release/);
  assert.doesNotMatch(releaseBlock, /signingConfigs\.debug/);
  for (const property of k_uploadKeyProperties) {
    assert.match(appBuildGradle, new RegExp(`findProperty\\('${property}'\\)`));
  }
  assert.match(appBuildGradle, /throw new GradleException\(/);
});
