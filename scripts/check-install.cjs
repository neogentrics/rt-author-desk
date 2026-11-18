'use strict';
// CI only: installs the real installer for this system, runs the app's self-test from the installed copy, and reports.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const release = path.join(__dirname, '..', 'release');
const reportDir = path.join(__dirname, '..', 'self-test-reports');
const installers = fs.readdirSync(release).filter((name) => /\.(exe|dmg|deb|AppImage)$/.test(name));

function find(pattern) {
  const name = installers.find((item) => pattern.test(item));
  if (!name) throw new Error(`No installer matches ${pattern}: ${installers.join(', ')}`);
  return path.join(release, name);
}

function selfTest(label, command, args = []) {
  const output = path.join(reportDir, `${process.platform}-${label}.json`);
  const started = Date.now();
  const run = spawnSync(command, [...args, `--self-test=${output}`], {
    stdio: 'inherit',
    timeout: 300000,
  });
  if (!fs.existsSync(output)) throw new Error(`${label}: no report (exit ${run.status}, ${run.error ?? 'no error'})`);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  report.label = label;
  report.wallSeconds = (Date.now() - started) / 1000;
  if (!report.ok || !report.packaged) {
    throw new Error(`${label} failed:\n${JSON.stringify(report, null, 2)}`);
  }
  console.log(`${label}: every check passed (${report.checks.length}).`);
  return report;
}

function windows() {
  const setup = find(/Setup\.exe$/);
  execFileSync('powershell', ['-NoProfile', '-Command', `Start-Process -Wait -FilePath '${setup}' -ArgumentList '/S'`]);
  const dir = ['rt-author-desk', 'RT Author Desk']
    .map((name) => path.join(process.env.LOCALAPPDATA, 'Programs', name))
    .find((item) => fs.existsSync(path.join(item, 'RT Author Desk.exe')));
  if (!dir) throw new Error('The installer finished but the app is not there.');
  const report = selfTest('installed', path.join(dir, 'RT Author Desk.exe'));
  const uninstaller = fs.readdirSync(dir).find((name) => /^Uninstall.*\.exe$/.test(name));
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Start-Process -Wait -FilePath '${path.join(dir, uninstaller)}' -ArgumentList '/S','_?=${dir}'`,
  ]);
  return [report];
}

function mac() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const dmg = find(new RegExp(`mac-${arch}\\.dmg$`));
  const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-dmg-'));
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-mountpoint', mount], { stdio: 'inherit' });
  const applications = fs.mkdtempSync(path.join(os.tmpdir(), 'rtst-app-'));
  execFileSync('cp', ['-R', path.join(mount, 'RT Author Desk.app'), applications]);
  execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' });
  return [selfTest('installed', path.join(applications, 'RT Author Desk.app/Contents/MacOS/RT Author Desk'))];
}

function linux() {
  const deb = find(/\.deb$/);
  execFileSync('sudo', ['apt-get', 'install', '-y', deb], { stdio: 'inherit' });
  const files = execFileSync('dpkg', ['-L', 'rt-author-desk'], { encoding: 'utf8' }).split('\n');
  const binary = files.find((file) => /\/opt\/.+\/rt-author-desk$/.test(file));
  if (!binary) throw new Error('The package installed but the app is not there.');
  const reports = [selfTest('deb', 'xvfb-run', ['-a', binary, '--no-sandbox'])];
  execFileSync('sudo', ['apt-get', 'remove', '-y', 'rt-author-desk'], { stdio: 'inherit' });

  const image = find(/\.AppImage$/);
  fs.chmodSync(image, 0o755);
  reports.push(selfTest('appimage', 'xvfb-run', ['-a', image, '--appimage-extract-and-run', '--no-sandbox']));
  return reports;
}

function summary(reports) {
  const lines = ['| Build | Checks | SQLite | Cipher | Size |', '|---|---|---|---|---|'];
  for (const report of reports) {
    const { versions, checks } = report;
    lines.push(`| ${report.platform}-${report.arch} ${report.label} | ${checks.length} passed | ${versions.sqlite} | ${versions.cipher} | |`);
  }
  for (const name of installers) {
    const mb = (fs.statSync(path.join(release, name)).size / 1e6).toFixed(1);
    lines.push(`| ${name} | | | | ${mb} MB |`);
  }
  const text = `${lines.join('\n')}\n`;
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  fs.writeFileSync(path.join(reportDir, `${process.platform}-summary.md`), text);
}

fs.mkdirSync(reportDir, { recursive: true });
const run = { win32: windows, darwin: mac, linux }[process.platform];
summary(run());
