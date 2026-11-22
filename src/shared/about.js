'use strict';
// What the About window says and links to, as the suite asks for it: Website, What's new in this version, Report a problem or suggest a
// feature, and Source code, each with a line of explanation, then the License and the open-source notices. The wording is RT Markdown
// Reader's. Kept apart from the window so a test can check every address.
(function defineAbout(root) {
  const REPO = 'https://github.com/neogentrics/rt-author-desk';
  // The Recon Towers page for this app comes when the app is listed. Until then the link goes to the page that lists the projects.
  const WEBSITE = 'https://recontowers.com/projects/';

  /** The four links, each with the words that say where it goes. `version` is the one that is running. */
  const aboutLinks = (version) => [
    { key: 'website', label: 'Website', about: 'RT Author Desk on Recon Towers', url: WEBSITE },
    { key: 'notes', label: 'What’s new in this version', about: 'Release notes on GitHub', url: `${REPO}/releases/tag/v${version}` },
    { key: 'issue', label: 'Report a problem or suggest a feature', about: 'GitHub issues', url: `${REPO}/issues/new/choose` },
    { key: 'source', label: 'Source code', about: 'github.com/neogentrics/rt-author-desk', url: REPO },
  ];

  const legalLinks = () => [
    { key: 'license', label: 'License', url: `${REPO}/blob/main/LICENSE` },
    { key: 'notices', label: 'Open-source notices', url: `${REPO}/blob/main/THIRD_PARTY_NOTICES.md` },
  ];

  /** The computer, in a line: "Windows 10.0.22631 (x64)". */
  const osName = (platform, release, arch) => `${platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'} ${release} (${arch})`;

  /** What goes into a bug report: the app and its version, what it runs on, and the computer. Nothing about the person or the library. */
  const detailsText = (info) => [
    `RT Author Desk ${info.version}${info.portable ? ' (portable)' : ''}`,
    `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`,
    info.os,
  ].join('\n');

  const aboutApi = { REPO, WEBSITE, aboutLinks, detailsText, legalLinks, osName };
  // The main process and the tests load this as a module, and the window loads it as a plain script.
  if (typeof module !== 'undefined' && module.exports) module.exports = aboutApi;
  else root.ADAbout = aboutApi;
})(typeof window !== 'undefined' ? window : globalThis);
