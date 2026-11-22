'use strict';
// The first run: a short welcome with three ways to begin, shown once, to a library with nothing in it. Whichever way is chosen (or if it
// is just closed), it isn't shown again. Everything it offers can be found again later in the menus and in Help.
(() => {
  const { h } = AD;

  AD.welcome = () => {
    const seen = () => window.desk.saveSettings({ welcomed: true });
    const choose = (then) => () => { dialog.close(); then(); };
    const option = (title, text, then, primary = false) => h('button', { type: 'button', class: `choice${primary ? ' primary' : ''}`, onclick: choose(then) },
      h('strong', null, title), h('span', null, text));

    const dialog = AD.dialog('Welcome to RT Author Desk', h('div', { class: 'stack' },
      h('p', { class: 'lead' }, 'The business side of being an author, on your own computer: your books, where they are sold, what they cost, and what needs you. Everything stays on this computer, and nothing you enter is ever sent anywhere.'),
      h('p', null, 'How would you like to begin?'),
      h('div', { class: 'choices' },
        option('Start my own catalog', 'Add your first book. A title is enough to begin.', () => AD.addBook(), true),
        option('Bring in my books from a file', 'If you keep a list in a spreadsheet or in Notion, bring it in as a CSV file.', () => AD.importBooks()),
        option('Look around a made-up catalog first', 'A short tour of a sample catalog. Nothing in it is yours, and leaving puts everything back.', () => AD.startTour())),
      h('p', { class: 'note' }, 'You can find all of this again later: Help, then Help Center, has the tour and a guide for everything.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => dialog.close() }, "I'll look around myself"))));
    dialog.addEventListener('close', seen);
  };

  // Shown to a new, empty library that hasn't been welcomed. A library that already has books is never greeted, and is marked so.
  AD.maybeWelcome = async (settings) => {
    if (settings?.welcomed) return;
    try {
      const home = await AD.call('desk');
      if (!home.isEmpty) { await window.desk.saveSettings({ welcomed: true }); return; }
      AD.welcome();
    } catch { /* no welcome is no harm */ }
  };
})();
