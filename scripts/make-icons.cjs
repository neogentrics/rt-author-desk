'use strict';
// Remakes build/icon.png and build/icon.ico from build/icon.svg, using the Electron that is already installed, so nothing else has
// to be set up. Only needed when the logo changes. The results are committed.
//
//   npx electron scripts/make-icons.cjs        (on a machine with no display: xvfb-run -a npx electron --no-sandbox scripts/make-icons.cjs)
//
// The svg is the single source. The png is 512 by 512 with a clear background, and the ico holds the sizes Windows asks for.
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, app } = require('electron');

const build = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(build, 'icon.svg'), 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  // One window, with the svg drawn at each size in turn, and the square it covers cut out. Small windows are refused by some systems.
  const win = new BrowserWindow({ show: false, transparent: true, frame: false, backgroundColor: '#00000000', width: 512, height: 512, useContentSize: true });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`)}`);
  const render = async (size) => {
    await win.webContents.executeJavaScript(`(() => { const s = document.querySelector('svg'); s.setAttribute('width', ${size}); s.setAttribute('height', ${size}); })()`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG();
  };

  fs.writeFileSync(path.join(build, 'icon.png'), await render(512));
  // The About window shows the same drawing, so the app's own folder gets a copy of the svg. A test checks the two are the same.
  fs.copyFileSync(path.join(build, 'icon.svg'), path.join(__dirname, '..', 'src', 'renderer', 'icon.svg'));

  const images = [];
  for (const size of SIZES) images.push(await render(size));

  // An ICO file is a small table followed by PNGs.
  const header = Buffer.alloc(6 + 16 * SIZES.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(SIZES.length, 4);
  let offset = header.length;
  SIZES.forEach((size, at) => {
    const entry = 6 + at * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[at].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[at].length;
  });
  fs.writeFileSync(path.join(build, 'icon.ico'), Buffer.concat([header, ...images]));
  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
