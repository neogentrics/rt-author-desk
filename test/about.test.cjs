'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO, WEBSITE, aboutLinks, detailsText, legalLinks, osName } = require('../src/shared/about');

const root = path.join(__dirname, '..');

test('the four links are the suite\'s, in its order, with its words and a line saying where each goes', () => {
  const links = aboutLinks('1.0.0');
  assert.deepEqual(links.map((l) => l.label), ['Website', 'What’s new in this version', 'Report a problem or suggest a feature', 'Source code']);
  assert.deepEqual(links.map((l) => l.key), ['website', 'notes', 'issue', 'source']);
  for (const link of links) assert.ok(link.about.length > 5, `${link.key} says where it goes`);
});

test('every address is https, on this project\'s GitHub or recontowers.com, and nothing else', () => {
  for (const link of [...aboutLinks('1.0.0'), ...legalLinks()]) {
    const url = new URL(link.url);
    assert.equal(url.protocol, 'https:', link.key);
    assert.ok(['github.com', 'recontowers.com'].includes(url.hostname), `${link.key}: ${url.hostname}`);
    if (url.hostname === 'github.com') assert.ok(url.pathname.startsWith('/neogentrics/rt-author-desk'), `${link.key}: ${url.pathname}`);
  }
  assert.equal(WEBSITE, 'https://recontowers.com/projects/');
});

test('the release notes are the ones for the version that is running, test builds included', () => {
  assert.equal(aboutLinks('1.0.0').find((l) => l.key === 'notes').url, `${REPO}/releases/tag/v1.0.0`);
  assert.equal(aboutLinks('1.0.0-alpha.1').find((l) => l.key === 'notes').url, `${REPO}/releases/tag/v1.0.0-alpha.1`);
});

test('the License and the open-source notices are files this repository has, and a report can be made on its issue page', () => {
  const [license, notices] = legalLinks();
  assert.deepEqual([license.label, notices.label], ['License', 'Open-source notices']);
  assert.ok(license.url.endsWith('/blob/main/LICENSE') && fs.existsSync(path.join(root, 'LICENSE')));
  assert.ok(notices.url.endsWith('/blob/main/THIRD_PARTY_NOTICES.md') && fs.existsSync(path.join(root, 'THIRD_PARTY_NOTICES.md')));
  const templates = fs.readdirSync(path.join(root, '.github', 'ISSUE_TEMPLATE'));
  assert.ok(templates.includes('bug_report.yml') && templates.includes('feature_request.yml'), 'the page the link opens has a bug report and a feature request');
});

test('what is copied for a bug report is three lines: the app, what it runs on, and the computer, and nothing about the person', () => {
  const info = { version: '1.0.0', portable: false, electron: '45.2.1', chrome: '140.0.1', node: '24.1.0', os: osName('linux', '6.8.0', 'x64'), libraryFolder: '/home/someone/.config/RT Author Desk/library' };
  assert.equal(detailsText(info), 'RT Author Desk 1.0.0\nElectron 45.2.1 · Chromium 140.0.1 · Node 24.1.0\nLinux 6.8.0 (x64)');
  assert.ok(!detailsText(info).includes('someone'), 'the library\'s folder is not in it');
  assert.equal(detailsText({ ...info, portable: true }).split('\n')[0], 'RT Author Desk 1.0.0 (portable)');
});

test('the computer is named the way people name it', () => {
  assert.equal(osName('win32', '10.0.22631', 'x64'), 'Windows 10.0.22631 (x64)');
  assert.equal(osName('darwin', '24.1.0', 'arm64'), 'macOS 24.1.0 (arm64)');
  assert.equal(osName('linux', '6.8.0', 'x64'), 'Linux 6.8.0 (x64)');
});

test('the drawing in the About window is the app\'s icon, the very same file', () => {
  assert.equal(fs.readFileSync(path.join(root, 'src', 'renderer', 'icon.svg'), 'utf8'), fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8'));
});
