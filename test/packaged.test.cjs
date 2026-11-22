'use strict';
// Opens the window of a real build (an installed one, or the unpacked folder electron-builder makes) and checks that it draws: the toolbar,
// the sidebar, the first screen, with nothing in the console. The self-test proves the build's storage and catalog work, but it has no window,
// so a build that left out a file the window needs (a script, the fonts, the icon) would pass it and open blank. This is what catches that.
// It runs when RTAD_PACKAGED_APP names the program to start, which the pipeline does after building.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launch } = require('./e2e/driver.cjs');

const program = process.env.RTAD_PACKAGED_APP;
const skip = !program && 'set RTAD_PACKAGED_APP to the program of a built copy of the app to try it';

test('the window of the built app opens and draws, with nothing wrong in the console', { skip, timeout: 90_000 }, async () => {
  assert.ok(fs.existsSync(program), `${program} exists`);
  const app = await launch({ packaged: program });
  try {
    // The page is drawn: the sidebar has every screen, the toolbar has its buttons, and the first screen has its heading.
    const drawn = await app.run(`({
      screens: document.querySelectorAll('#nav a').length,
      tools: document.querySelectorAll('#toolbar > .tb-group button').length,
      heading: document.querySelector('main h1')?.textContent ?? '',
      icon: Boolean(document.querySelector('.tb-btn svg')),
      font: getComputedStyle(document.body).fontFamily,
    })`);
    assert.equal(drawn.screens, 10, 'every screen is in the sidebar');
    assert.equal(drawn.tools, 6, 'every button is on the toolbar');
    assert.ok(drawn.heading.length > 0, 'the first screen has its heading');
    assert.equal(drawn.icon, true, 'the toolbar draws its icons');

    // The scripts, the styles and the pictures it needs are all there: opening the windows that load more of them draws them too.
    assert.equal(await app.run('window.desk.runCommand("about")'), true);
    await app.until("document.querySelector('dialog#about[open]')", 'About to open');
    assert.equal(await app.run("document.querySelector('.about-logo').naturalWidth > 0"), true, 'the icon About shows loaded');
    await app.key('Escape');
    await app.run('void AD.openHelp()');
    await app.until("document.querySelector('dialog#help[open]') && document.querySelectorAll('.help-nav button').length > 10", 'the Help Center to fill');
    await app.key('Escape');
    const fonts = await app.run("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))");
    assert.ok(fonts.length >= 1, `the fonts that travel with the app load (${fonts})`);

    // It is the built copy that is running, with its own version and a library it could open.
    const info = await app.run('window.desk.info()');
    assert.match(info.version, /^\d+\.\d+\.\d+/);
    assert.equal(info.library.ok, true, 'the library opens');
    assert.deepEqual(app.problems, [], 'nothing was reported wrong by the page');
  } finally {
    await app.close();
  }
});
