'use strict';
// Help → About RT Author Desk: what the app is, its version, where it lives on the web, and the details a bug report needs, copied in
// one click. The layout and the wording are RT Markdown Reader's. It's a native dialog, so Escape closes it and focus goes back.
(() => {
  const { h } = AD;
  const { aboutLinks, legalLinks } = window.ADAbout;

  // A link opens in the person's browser (the app hands any https address on to it), and says so for a screen reader.
  const outside = (link, text = link.label) => h('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer' }, text, h('span', { class: 'visually-hidden' }, ' (opens in your browser)'));

  AD.openAbout = async () => {
    document.getElementById('about')?.remove();
    let info;
    try {
      const result = await window.desk.about();
      if (!result.ok) throw new Error(result.message);
      info = result.value;
    } catch (problem) {
      AD.toast(problem.message);
      return;
    }
    const copy = h('button', { type: 'button', class: 'link', id: 'about-copy' }, 'Copy details');
    const done = h('button', { type: 'button', class: 'primary', id: 'about-done' }, 'Done');
    const dialog = h('dialog', { class: 'about', id: 'about', 'aria-labelledby': 'about-title' },
      h('div', { class: 'about-top' },
        h('img', { class: 'about-logo', src: 'icon.svg', alt: '', width: '64', height: '64' }),
        h('div', null,
          h('h2', { id: 'about-title', translate: 'no' }, 'RT Author Desk'),
          h('p', { class: 'about-version' }, `Version ${info.version}${info.portable ? ' (portable)' : ''}`))),
      h('p', { class: 'about-blurb' }, 'The business side of being an author, on your own computer. Built by the Recon Towers Dev Department.'),
      h('ul', { class: 'about-links' }, aboutLinks(info.version).map((link) => h('li', null, outside(link), h('span', null, link.about)))),
      h('p', { class: 'about-tech', translate: 'no' }, `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · ${info.os}`),
      h('p', { class: 'about-tech' }, 'Your library is kept in ', h('span', { class: 'mono', translate: 'no' }, info.libraryFolder), '.'),
      h('p', { class: 'about-legal' }, `© ${info.year} Recon Towers. All rights reserved.`, legalLinks().map((link) => [' · ', outside(link)])),
      h('div', { class: 'actions' }, copy, h('span', { class: 'spacer' }), done));

    copy.addEventListener('click', async () => {
      try {
        const result = await window.desk.copyDetails();
        if (!result.ok) throw new Error(result.message);
        AD.toast('Version details copied. Paste them into a bug report.');
      } catch (problem) {
        AD.toast(problem.message);
      }
    });
    done.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    done.focus();
  };
})();
