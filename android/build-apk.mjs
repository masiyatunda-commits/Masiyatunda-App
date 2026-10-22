// Builds the MilkyWay Android app (Trusted Web Activity) and publishes it to
// milkyway/download/MilkyWay.apk, plus the matching /.well-known/assetlinks.json.
//
// Usage:
//   BUBBLEWRAP_CORE_DIR=/path/with/node_modules/@bubblewrap/core \
//   JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/android-sdk \
//   node android/build-apk.mjs
//
// Before each new release, raise appVersionCode/appVersion in twa-manifest.json.
// Always sign with android/signing/milkyway-release.keystore: a different key makes
// Android refuse to update an installed copy ("App not installed").
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const require = createRequire(path.join(process.env.BUBBLEWRAP_CORE_DIR || process.cwd(), 'index.js'));
const { TwaManifest, TwaGenerator, GradleWrapper, AndroidSdkTools, Config, JdkHelper, ConsoleLog } = require('@bubblewrap/core');

const javaHome = process.env.JAVA_HOME;
const sdkHome = process.env.ANDROID_HOME;
if (!javaHome || !sdkHome) throw new Error('Set JAVA_HOME (JDK 17) and ANDROID_HOME.');

const props = Object.fromEntries(fs.readFileSync(path.join(here, 'signing/keystore.properties'), 'utf8')
  .split('\n').filter(Boolean).map(line => line.split(/=(.*)/s).slice(0, 2)));
const keystore = path.join(here, 'signing/milkyway-release.keystore');
const manifestJson = JSON.parse(fs.readFileSync(path.join(here, 'twa-manifest.json'), 'utf8'));
manifestJson.signingKey = { path: keystore, alias: props.keyAlias };
const twaManifest = new TwaManifest(manifestJson);
const errors = twaManifest.validate();
if (errors) throw new Error(errors);

const log = new ConsoleLog('milkyway-apk');
const config = new Config(javaHome, sdkHome);
const jdkHelper = new JdkHelper(process, config);
const sdkTools = await AndroidSdkTools.create(process, config, jdkHelper, log);

const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milkyway-twa-'));
await new TwaGenerator().createTwaProject(projectDir, twaManifest, log);
await new GradleWrapper(process, sdkTools, projectDir).assembleRelease();

const unsigned = path.join(projectDir, 'app/build/outputs/apk/release/app-release-unsigned.apk');
const aligned = path.join(projectDir, 'app-release-aligned.apk');
const outDir = path.join(repo, 'milkyway/download');
const output = path.join(outDir, 'MilkyWay.apk');
fs.mkdirSync(outDir, { recursive: true });
if (!(await sdkTools.checkBuildTools())) await sdkTools.installBuildTools();
await sdkTools.zipalign(unsigned, aligned);
await sdkTools.apksigner(keystore, props.storePassword, props.keyAlias, props.keyPassword, aligned, output);

// Domain association so Android opens the app full-screen (no browser address bar).
const certOut = execFileSync(path.join(javaHome, 'bin/keytool'),
  ['-list', '-v', '-keystore', keystore, '-alias', props.keyAlias, '-storepass', props.storePassword], { encoding: 'utf8' });
const sha256 = certOut.match(/SHA256:\s*([0-9A-F:]+)/)[1];
fs.mkdirSync(path.join(repo, '.well-known'), { recursive: true });
fs.writeFileSync(path.join(repo, '.well-known/assetlinks.json'), JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: twaManifest.packageId, sha256_cert_fingerprints: [sha256] },
}], null, 2) + '\n');

fs.rmSync(projectDir, { recursive: true, force: true });
console.log(`Built ${path.relative(repo, output)} (${twaManifest.packageId} ${twaManifest.appVersionName}, code ${twaManifest.appVersionCode})`);
