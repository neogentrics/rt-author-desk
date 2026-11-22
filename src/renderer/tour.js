'use strict';
// A look around a made-up catalog. The catalog is a separate library that the app throws away afterwards, so nothing in the tour
// can touch the person's own books. The bars at the top say where you are, and what to do about an update.
(() => {
  const { h } = AD;
  const bars = document.getElementById('bars');
  AD.state = { sample: false, tour: null, update: { state: 'idle' } };

  // Anything that needs saying above the page: you're in a made-up catalog, or a new version is here.
  AD.drawBars = () => {
    const out = [];
    if (AD.state.sample) {
      out.push(h('div', { class: 'bar', role: 'status' },
        h('span', null, h('strong', null, 'A made-up catalog. '), 'Nothing here is yours, and leaving puts everything back.'),
        h('span', { class: 'row start' },
          AD.state.tour ? null : h('button', { type: 'button', onclick: () => AD.startTour(true) }, 'Take the tour'),
          h('button', { type: 'button', onclick: () => AD.leaveSample() }, 'Leave it'))));
    }
    const u = AD.state.update;
    if (u.state === 'downloading') out.push(h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${u.version} is downloading. You'll be asked to restart when it's ready.`)));
    if (u.state === 'ready') out.push(h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${u.version} is ready.`), h('button', { type: 'button', onclick: () => window.desk.installUpdate() }, 'Restart to update')));
    if (u.state === 'available') out.push(h('div', { class: 'bar', role: 'status' }, h('span', null, `Version ${u.version} is available.`), h('button', { type: 'button', onclick: () => window.desk.openReleases() }, 'Open the download page')));
    bars.replaceChildren(...out); // the sidebar is kept below them by the toolbar's observer
  };

  const STEPS = [
    { route: () => '#/', title: 'This is your Desk', text: 'It answers one question: what needs you today? Here is the next release and what is in its way, with the problems the app found below it.' },
    { route: () => '#/books', title: 'Your books', text: 'Every book, with its series and where it stands. A red number means problems on that book. Open one to see more.' },
    {
      route: async () => {
        const books = await AD.call('books');
        const book = books.find((b) => b.title === 'Tidewater') ?? books[0];
        return `#/book/${encodeURIComponent(book.id)}`;
      },
      after: () => document.getElementById('grid')?.scrollIntoView(),
      title: 'Where it is sold', text: 'Editions down the side, stores across the top. A plus is a gap: click it to list the book there. A red square has a clash.',
    },
    { route: () => '#/clashes', title: 'Clashes', text: 'Real problems across everything, each with what to do about it. If one is fine, dismiss it with a reason, and you can bring it back later.' },
    { route: () => '#/audiobooks', title: 'Audiobooks', text: 'Every audiobook on every store: which recording is live, whose voice it is, what rights it has, and which are waiting to be replaced.' },
    { route: () => '#/calendar', title: 'The calendar', text: 'Every dated release, soonest first, so nothing sneaks up on you.' },
    { route: () => '#/isbns', title: 'ISBNs', text: 'Every number you own or were given, where each is used, and which are still spare. A number that fails its check digit is refused.' },
    { route: () => '#/', title: 'That is the tour', text: 'When you are ready, leave the made-up catalog and add your first book. Help (F1) has a short guide for everything.', last: true },
  ];

  let card = null;
  const closeCard = () => {
    card?.remove();
    card = null;
    AD.state.tour = null;
    AD.drawBars();
  };

  async function go(at) {
    const step = STEPS[at];
    AD.state.tour = { at };
    location.hash = await step.route();
    await AD.refresh();
    step.after?.();
    card?.remove();
    const next = h('button', { type: 'button', class: 'primary', onclick: () => (step.last ? finish() : go(at + 1)) }, step.last ? 'Leave and add my first book' : 'Next');
    card = h('section', { class: 'tour', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tour-title' },
      h('p', { class: 'note' }, `Step ${at + 1} of ${STEPS.length}`),
      h('h2', { id: 'tour-title' }, step.title),
      h('p', null, step.text),
      h('div', { class: 'actions' },
        step.last ? h('button', { type: 'button', onclick: closeCard }, 'Keep looking around') : h('button', { type: 'button', onclick: closeCard }, 'Stop the tour'),
        at > 0 ? h('button', { type: 'button', onclick: () => go(at - 1) }, 'Back') : null,
        next));
    document.body.append(card);
    next.focus();
    AD.drawBars();
  }

  async function finish() {
    closeCard();
    await AD.leaveSample();
    AD.addBook();
  }

  // Starts the made-up catalog if it isn't open, then the tour. From the bar, the catalog is already open.
  AD.startTour = async (already = false) => {
    if (!AD.state.sample || !already) {
      const result = await window.desk.startSample();
      if (!result.ok) { AD.toast(result.message); return; }
      AD.state.sample = true;
    }
    await go(0);
  };

  AD.leaveSample = async () => {
    closeCard();
    await window.desk.leaveSample();
    AD.state.sample = false;
    AD.drawBars();
    location.hash = '#/';
    await AD.refresh();
  };
})();
