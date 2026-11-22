'use strict';
// Remakes the pictures in docs/screenshots from the made-up catalog, so they match the app and show nothing of anyone's own. The app opens
// on a throwaway library, so nothing here can touch yours. Needs a screen (on a server: xvfb-run -a npm run screenshots).
const path = require('node:path');
const { launch } = require('../test/e2e/driver.cjs');

const out = path.join(__dirname, '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const app = await launch();
  try {
    await app.viewport(1280, 860);
    // The made-up catalog, without the bar that says so, which belongs to the tour.
    await app.run('window.desk.startSample().then(() => AD.refresh())');
    await sleep(900);
    const shot = async (name) => { await sleep(600); await app.screenshot(path.join(out, `${name}.png`)); console.log(`${name}.png`); };
    const closeAll = () => app.run("document.querySelectorAll('dialog[open]').forEach((d) => d.close())");

    for (const [name, hash] of [['desk', '#/'], ['audiobooks', '#/audiobooks'], ['calendar', '#/calendar'], ['clashes', '#/clashes'], ['isbns', '#/isbns'], ['stores', '#/names']]) {
      await app.goTo(hash);
      await shot(name);
    }
    const book = (await app.call('books')).find((b) => b.title === 'Tidewater');
    await app.goTo(`#/book/${book.id}`);
    await sleep(500);
    await app.run("document.getElementById('grid').scrollIntoView()");
    await shot('store-grid');
    await app.run("document.getElementById('eds').scrollIntoView()");
    await shot('credits');

    await app.run('void AD.openPreferences()');
    await shot('preferences');
    await closeAll();
    await app.run("AD.openHelp('clashes')");
    await shot('help');
    await closeAll();
    await app.goTo('#/');
    await app.key('k', { ctrl: true });
    await app.until("document.querySelectorAll('#palette-list li').length > 8", 'Go to to fill');
    await shot('goto');
    await closeAll();

    // Your own colours, last, since they stay on the page.
    await app.run('window.desk.runCommand("customize-theme")');
    await app.until("document.querySelector('dialog#customize[open]')");
    for (const colour of ['Accent colour #0b7285', 'Panel colour #12355b', 'Background colour #0f2a43']) await app.run(`document.querySelector('#customize [aria-label="${colour}"]').click()`);
    await shot('customize');
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
