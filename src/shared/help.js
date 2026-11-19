'use strict';
// The Help Center's guides, as data: short, in plain words, and searchable. A guide is a list of blocks. In the text of a
// block, **bold** is bold, [words](help:guide-name) opens another guide, and [words](go:books) opens a screen of the app.
// Written for someone who has never used the app and doesn't care how it works inside.

const SCREENS = ['desk', 'books', 'audiobooks', 'calendar', 'clashes', 'isbns', 'names'];

const GUIDES = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    summary: 'What to do first, in five minutes.',
    keywords: 'first start begin new empty tour sample',
    blocks: [
      { type: 'p', text: 'RT Author Desk keeps the business side of your books in one place on your own computer: what you\'ve published, where it\'s sold, at what price, and what\'s wrong.' },
      { type: 'h', text: 'The quickest way in' },
      { type: 'ol', items: [
        '[Add a book](go:books). A title is enough. The rest can come later.',
        'Open the book and add an **edition** for each format: ebook, paperback, hardcover, large print or audiobook.',
        'Put each edition on the stores that sell it. A store is a square in the **store grid**, and clicking an empty square lists the book there.',
        'Look at [Clashes](go:clashes). It finds real problems and says what to do about each.',
      ] },
      { type: 'note', text: 'Want to look around first? [Take the tour](tour:start) of a made-up catalog. Nothing in it is yours, and leaving it puts everything back.' },
      { type: 'p', text: 'Your library is stored encrypted on this computer, and nothing is sent anywhere. See [where your library is kept](help:library).' },
    ],
  },
  {
    slug: 'books-and-series',
    title: 'Books, series and names',
    summary: 'Adding a book, putting it in a series, and the pen and publisher names.',
    keywords: 'book series pen name publisher name new number status standalone',
    blocks: [
      { type: 'p', text: 'A **book** is the work itself: its title, whether it\'s in a series, the pen name it\'s under, and where it stands (planned, in progress, live, pulled or being reworked). Formats are **editions** of a book.' },
      { type: 'h', text: 'Series, pen names and publisher names' },
      { type: 'ul', items: [
        'Make them on [Stores and names](go:names): **Add a series**, **Add a pen name**, **Add a publisher name**. Then choose them when you add or change a book.',
        'A publisher name can have dates, because a name can change and old editions still show the old one.',
        'A book that is not in a series can be given one at any time: open the book, choose **Edit**, and pick the series and its number.',
      ] },
      { type: 'note', text: 'Two spellings of one series name, such as "The Tide Books" and "Tide Books", stop a store grouping them. Clashes points that out.' },
    ],
  },
  {
    slug: 'editions-and-isbns',
    title: 'Editions and ISBNs',
    summary: 'One format of a book, and the numbers that identify it.',
    keywords: 'edition ebook paperback hardcover large print audiobook isbn check digit register cover files release date',
    blocks: [
      { type: 'p', text: 'An **edition** is one format of a book: ebook, paperback, hardcover, large print or audiobook. Each has its own release date, page count, trim size, and whether the cover and the final files are ready.' },
      { type: 'h', text: 'ISBNs' },
      { type: 'ul', items: [
        'The [ISBNs](go:isbns) page is a register of every number you own or were given, and which edition uses each one.',
        'The check digit is verified when you add one. A number that fails the check is refused, with the reason, unless you say you want it anyway.',
        'A ten-digit ISBN is turned into the thirteen-digit one. Each number can be in the register once.',
        'A store\'s **free** ISBN can only be used with the store that gave it. If it turns up on another store, Clashes says so.',
        'Many stores don\'t need an ISBN for an ebook, so an ebook can have none.',
      ] },
    ],
  },
  {
    slug: 'listings-and-prices',
    title: 'Listing a book on a store',
    summary: 'Which edition is sold where, by what route, and at what price.',
    keywords: 'listing store price marketplace route distributor direct status live pre-order planned pulled program exclusive select asin',
    blocks: [
      { type: 'p', text: 'A **listing** is one edition on one store. It holds the store\'s own ID for it (such as an ASIN), a link, its status (planned, pre-order, live or pulled), and the publisher name the store shows.' },
      { type: 'h', text: 'The route' },
      { type: 'p', text: 'An edition can reach a store **directly** or **through a distributor**, and the same edition can be on one store both ways. The route matters because reports come from the account that pays you.' },
      { type: 'h', text: 'Prices' },
      { type: 'ul', items: [
        'A price belongs to a **marketplace** (such as US or UK) and starts on a date. A new date adds to the history, and the same date corrects that day.',
        'Money is always kept as a whole number of the smallest unit with its currency, never as a decimal that can drift.',
      ] },
      { type: 'h', text: 'Exclusive programs' },
      { type: 'p', text: 'If a listing is in an exclusive program (for example an ebook that can only be sold on one store for a term), mark it, with its dates. If the same edition is on sale elsewhere, [Clashes](help:clashes) tells you.' },
    ],
  },
  {
    slug: 'store-grid',
    title: 'The store grid',
    summary: 'One page per book: editions down the side, stores across the top.',
    keywords: 'grid gap store edition price clash square table where sold',
    blocks: [
      { type: 'p', text: 'Open a book and look at **Where it is sold**. Each row is an edition and each column is a store. A square shows the status and the price, and a **gap** is a place the book isn\'t sold.' },
      { type: 'ul', items: [
        'Click an **empty square** to list that edition on that store.',
        'Click a **filled square** to change the listing, set a price, or remove it.',
        'A square with a red **clash** tag has a real problem. Open the book to see what it is.',
        'Stores you\'ve switched off leave the grid, unless the book is still listed on one.',
      ] },
    ],
  },
  {
    slug: 'audiobooks',
    title: 'Audiobooks and recordings',
    summary: 'Which recording is live where, whose voice it is, and what is waiting to be replaced.',
    keywords: 'audiobook recording voice human synthesized cloned narrator acx google play exclusive rights replace royalty share permission',
    blocks: [
      { type: 'p', text: 'An audiobook edition can have more than one **recording** at once: a narrator\'s recording on one store and a store\'s auto-made one on another. Each recording is its own record, with its voice, who read it, and its rights.' },
      { type: 'ul', items: [
        '**Voice** is human, synthesized or cloned. A cloned voice counts as synthesized, and needs the person\'s permission on record.',
        'A recording tied to an **exclusive deal** names its store and the end date. Listing it somewhere else is a clash.',
        'Mark a recording **waiting to be replaced** when you plan to swap it, and say which recording replaces it once it exists.',
        'A listing says which recording is live on that store.',
      ] },
      { type: 'p', text: 'The [Audiobooks](go:audiobooks) page shows every audiobook against every store, so you can see what is live, in whose voice, under what rights, and what is waiting.' },
    ],
  },
  {
    slug: 'clashes',
    title: 'Clashes',
    summary: 'Real problems the app finds, what to do, and how to dismiss one.',
    keywords: 'clash problem fix check dismiss reason restore exclusive isbn publisher series cover date warning',
    blocks: [
      { type: 'p', text: '[Clashes](go:clashes) looks across your whole catalog for problems that are easy to miss one book at a time. Each one says what\'s wrong and what to do.' },
      { type: 'ul', items: [
        '**Fix** is a real problem, such as an ebook in an exclusive program that is also on sale elsewhere, or a free store ISBN used at another store.',
        '**Check** is worth a look but may be fine, such as a publisher name that differs between stores.',
        'You can **dismiss** one with a reason. It stays dismissed until the records it names change, and you can bring it back.',
      ] },
      { type: 'note', text: 'The number beside Clashes in the menu is the count of problems that need fixing.' },
    ],
  },
  {
    slug: 'desk-and-calendar',
    title: 'The Desk and the calendar',
    summary: 'What needs you today, and every dated release.',
    keywords: 'desk home calendar release date next blocking soon',
    blocks: [
      { type: 'p', text: 'The [Desk](go:desk) answers one question: what needs you today? It shows the next release and what is in its way, what is coming in the next 30 days, and the problems and checks from Clashes.' },
      { type: 'p', text: 'The [Calendar](go:calendar) lists every dated release, soonest first. A release can be dated on an edition, or on a store listing, because a book can reach a store later than its release.' },
    ],
  },
  {
    slug: 'look',
    title: 'Themes, fonts and colours',
    summary: 'Change how the app looks in Preferences.',
    keywords: 'theme dark light glass colour color safe blind font text size preferences appearance contrast',
    blocks: [
      { type: 'p', text: 'Open **Preferences** from the File menu, or press **Ctrl+,** (**Cmd+,** on a Mac). Everything changes the moment you pick it, so there is nothing to apply.' },
      { type: 'ul', items: [
        '**Theme.** The same fifteen themes as the other Recon Towers apps, or "Same as this computer" to follow its light and dark setting.',
        '**Glass.** Frosted panels over colour, with any theme but High Contrast.',
        '**Colour-safe colours.** Blue, orange and purple instead of green, amber and red, so good news, checks and problems stay apart with colour blindness. Each one also says what it means in words.',
        '**Font and text size.** Atkinson Hyperlegible is made to be easier to read.',
      ] },
    ],
  },
  {
    slug: 'updates',
    title: 'Updates and test builds',
    summary: 'How the app updates itself, and what a test build is.',
    keywords: 'update upgrade version alpha test build release check restart download',
    blocks: [
      { type: 'p', text: 'Until version 1.0.0 the app is released as **test builds**, numbered like 1.0.0-alpha.1. They are real, working versions that are still being finished, and each can be updated to the next.' },
      { type: 'ul', items: [
        'Choose **Help, then Check for Updates…** at any time. The app also checks by itself a few seconds after it opens, and every few hours.',
        'On **Windows** and the Linux **AppImage**, an update downloads in the background and you are asked to restart when it is ready.',
        'On a **Mac**, and with the Linux **.deb**, the app tells you a newer version exists and takes you to the download page.',
        'Your library is not touched by an update. Before any change to how it is stored, the app makes a backup copy first.',
      ] },
    ],
  },
  {
    slug: 'library',
    title: 'Where your library is kept',
    summary: 'It stays on this computer, encrypted.',
    keywords: 'library privacy encrypted encryption data stored where folder offline private backup password',
    blocks: [
      { type: 'p', text: 'Everything you enter is kept in one **encrypted database** in the app\'s own folder on this computer. There is no account, no server and no sign-in, and nothing is sent anywhere. It works with no internet.' },
      { type: 'ul', items: [
        'Without a password set, any copy of this app can open it, so that is privacy from a casual look, not secrecy. A password comes in a later version.',
        '**Help, then About** shows where the library is.',
        'Removing something leaves a marker for 90 days, and every change is logged. This is so the app can one day keep two computers in step.',
      ] },
    ],
  },
  {
    slug: 'shortcuts',
    title: 'Keyboard shortcuts',
    summary: 'The shortcuts for the menu and the screens.',
    keywords: 'keyboard shortcut keys ctrl cmd hotkey',
    blocks: [
      { type: 'ul', items: [
        '**Ctrl+N** (Cmd+N on a Mac): add a book',
        '**Ctrl+,** (Cmd+,): Preferences',
        '**F1**: this Help Center',
        '**Ctrl+1, Ctrl+2, Ctrl+3**: the Desk, Books and Calendar',
        '**Ctrl+Plus, Ctrl+Minus, Ctrl+0**: zoom in, zoom out, and back to the usual size',
        '**F11**: full screen',
        '**Esc**: close a window that has opened over the page',
      ] },
    ],
  },
  {
    slug: 'faq',
    title: 'Common questions',
    summary: 'Short answers.',
    keywords: 'question faq answer why how can',
    blocks: [
      { type: 'h', text: 'Does it sign in to Amazon or any other store?' },
      { type: 'p', text: 'No, never. Sales will come in as report files you download yourself, so the app needs no store account and keeps working when a store changes its website.' },
      { type: 'h', text: 'Is anything sent to the internet?' },
      { type: 'p', text: 'No. The only time the app goes online is to look for a newer version of itself.' },
      { type: 'h', text: 'Do I have to fill in everything?' },
      { type: 'p', text: 'No. A title is enough to start. Fill in what you know, and the app will point out what\'s missing when it matters.' },
      { type: 'h', text: 'How do I undo a mistake?' },
      { type: 'p', text: 'Removing a book, an edition or a listing asks first. Clashes you dismiss can be brought back. Backups and a Trash are coming in 1.0.' },
      { type: 'h', text: 'Where do I report a problem or ask for something?' },
      { type: 'p', text: 'Choose **Help, then Report a Problem**. It opens the page for it in your browser.' },
    ],
  },
];

// Every word the person types must be found, in the title, the summary, the keywords or the text. A word in the title counts most.
function textOf(guide) {
  return guide.blocks.flatMap((b) => (b.items ? b.items : [b.text])).join(' ');
}

function searchGuides(query, guides = GUIDES) {
  const words = String(query ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return guides.map((g) => ({ slug: g.slug, title: g.title, summary: g.summary, score: 0 }));
  const found = [];
  for (const guide of guides) {
    const parts = { title: guide.title.toLowerCase(), summary: guide.summary.toLowerCase(), keywords: guide.keywords.toLowerCase(), text: textOf(guide).toLowerCase() };
    let score = 0;
    let all = true;
    for (const word of words) {
      const here = (parts.title.includes(word) ? 8 : 0) + (parts.keywords.includes(word) ? 4 : 0) + (parts.summary.includes(word) ? 3 : 0) + (parts.text.includes(word) ? 1 : 0);
      if (!here) { all = false; break; }
      score += here;
    }
    if (all) found.push({ slug: guide.slug, title: guide.title, summary: guide.summary, score });
  }
  return found.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

const helpApi = { GUIDES, SCREENS, searchGuides, textOf };
if (typeof module !== 'undefined' && module.exports) module.exports = helpApi;
else window.ADHelp = helpApi;
