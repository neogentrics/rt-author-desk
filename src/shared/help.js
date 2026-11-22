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
        '[Add a book](go:books). A title is enough. The rest can come later. Or [bring in a list you already have](help:bring-in-books).',
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
        'The **Series**, **Pen name** and (on an edition) **Publisher name** boxes each end with a **New…** choice. Pick it, type the name, and it is made when you save, so nothing has to be set up first.',
        'A new series made beside a new pen name is filed under that pen name.',
        'They are all kept on [Stores and names](go:names), where you can see and rename them.',
        'A publisher name can have dates, because a name can change and old editions still show the old one.',
        'A book that is not in a series can be given one at any time: open the book, choose **Edit**, and pick or make the series and its number.',
      ] },
      { type: 'note', text: 'Two spellings of one series name, such as "The Tide Books" and "Tide Books", stop a store grouping them. Clashes points that out.' },
    ],
  },
  {
    slug: 'bring-in-books',
    title: 'Bring in your books from a file',
    summary: 'Use a spreadsheet, or a Notion export, instead of typing every book.',
    keywords: 'import csv notion spreadsheet excel file columns match undo export bring in list',
    blocks: [
      { type: 'p', text: 'If you already keep a list of your books, in a spreadsheet or in Notion, you can bring it in as a **CSV file**. In Notion, open the table, choose **Export**, and pick **CSV**. In a spreadsheet, choose **Save as** and pick CSV.' },
      { type: 'ol', items: [
        'Choose **Bring in books from a file…** on the [Books](go:books) page, or **Bring In Books from a File…** in the File menu.',
        '**Match your columns.** The app guesses which column is the title, the series, the status, the formats, the release date, the Amazon link and the notes. Correct anything it got wrong. Only the title is needed.',
        '**Check what it found.** You see every book it would make, and which rows it will skip and why. A word it doesn\'t know, such as a status of "Parked", is listed so you can say what it means.',
        '**Bring them in.** It all happens in one step, or not at all.',
      ] },
      { type: 'h', text: 'What it does with each column' },
      { type: 'ul', items: [
        '**Series.** A series that already exists is used, and a new one is made. Notion\'s page addresses are removed from the name.',
        '**Formats.** "Ebook, Paperback, Audiobook" makes an edition of each. Words like Kindle, Print and Audio are understood.',
        '**Release date.** Dates written out (March 1, 2025) or as 2025-03-01 just work. For 3/1/2025 you say whether the month or the day comes first. A range uses its first day.',
        '**Amazon link.** The link\'s code is kept on a KDP listing for the ebook, or the link is kept in the notes. It is never guessed which edition a link belongs to.',
      ] },
      { type: 'note', text: 'A book whose title is already in your library is skipped, so importing the same file twice adds nothing. **Books you brought in** on the Books page has an **Undo**, which takes the whole import back and leaves anything you\'ve added to since.' },
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
    slug: 'credits',
    title: 'People and credits',
    summary: 'Crediting an editor, an artist or a narrator, and what each store shows.',
    keywords: 'credit credits contributor editor narrator cover artist illustrator proofreader translator formatter person people shown store',
    blocks: [
      { type: 'p', text: 'The people who worked on an edition are **credited** on it, each in a role: editor, proofreader, cover artist, illustrator, narrator, translator, formatter or other. A person is kept once, on [Stores and names](go:names), and can be credited on any number of editions.' },
      { type: 'h', text: 'Crediting someone' },
      { type: 'ol', items: [
        'Open the book and find the edition.',
        'Under **Credits**, choose **Credit someone**. Pick the person, or choose **New person…** and type their name, then pick what they did.',
        'The same person can be credited in two roles on one edition, such as editor and proofreader, one credit at a time.',
      ] },
      { type: 'h', text: 'What each store shows' },
      { type: 'p', text: 'A store may leave someone off. In the store grid, click the edition\'s square on that store and choose **Write down what it shows**. Open the store\'s page, and tick the credits it shows. Nothing is ticked for you, because the point is to find what is missing.' },
      { type: 'note', text: 'A store that has not been written down is never checked. Once it has, [Clashes](help:clashes) says when someone credited on the edition is missing from it, and which stores do show them.' },
      { type: 'p', text: 'A person who is still credited cannot be removed. Remove their credits first. Taking a credit off an edition also takes it off every store\'s list.' },
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
        '**Check** is worth a look but may be fine, such as a publisher name that differs between stores, or an editor credited on one store and left off another.',
        'You can **dismiss** one with a reason. It stays dismissed until the records it names change, and you can bring it back.',
      ] },
      { type: 'note', text: 'The number beside Clashes in the menu is the count of problems that need fixing.' },
    ],
  },
  {
    slug: 'trash-and-backups',
    title: 'The Trash, backups and export',
    summary: 'Getting back what you removed, keeping a copy, and taking everything out.',
    keywords: 'trash delete remove undo restore bring back backup backups copy folder onedrive dropbox restore lost recover export csv json spreadsheet excel get out all',
    blocks: [
      { type: 'h', text: 'The Trash' },
      { type: 'ul', items: [
        'Removing a book, an edition or a listing moves it to the **Trash**, where it waits for **30 days**. After that it is removed for good.',
        'An edition takes its listings, prices and recordings with it, and the ISBNs it held go back in your register. Bringing the edition back returns all of it, exactly as it was.',
        'Open **Trash** in the menu on the left. Something can\'t come back before what it belongs to: an edition needs its book, and the Trash says so if its book is in there too.',
      ] },
      { type: 'h', text: 'Backups' },
      { type: 'ol', items: [
        'Open **Preferences** (Ctrl+,) and find **Backups**.',
        'Choose a folder. A folder in OneDrive or Dropbox is a good choice, because a backup is one closed file that is safe there.',
        'Choose how often. A backup is only made when something has changed, and the oldest ones are removed past the number you keep.',
        '**Back up now** makes one whenever you like.',
      ] },
      { type: 'h', text: 'Getting it all out' },
      { type: 'p', text: 'Choose **Export Everything…** in the File menu (Ctrl+E), or in Preferences. It makes a new folder inside the one you pick, with your whole library as one **JSON** file, a **spreadsheet (CSV)** for each kind of thing with names filled in beside the ids, and each sales report you imported as it was. Nothing secret is in it, but it holds your catalog in the open, so keep it somewhere private.' },
      { type: 'p', text: 'A backup holds your whole library, still encrypted. To go back to one, choose **Restore from a backup…**. It tells you what is in it, and when you confirm, your library is replaced and the app starts again. The library you had is not deleted: it is kept in a folder beside it, so a restore can be undone by hand.' },
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
      { type: 'p', text: 'The **theme button** (the moon, at the right of the toolbar) is on every screen. It changes the theme, Glass and colour-safe colours without opening anything else. For everything else, open **Preferences** from the File menu or the toolbar, or press **Ctrl+,** (**Cmd+,** on a Mac). Everything changes the moment you pick it, so there is nothing to apply. The View menu has the same choices.' },
      { type: 'ul', items: [
        '**Theme.** The same fifteen themes as the other Recon Towers apps, or **Follow System** to follow this computer\'s light and dark setting.',
        '**Glass.** Frosted panels over colour, with any theme but High Contrast. It stays solid while you use your own panel or background colour, because frosted colour could make the words hard to read.',
        '**Customize Theme** (in the View menu, the theme button and Preferences). Choose your own **accent**, **panel** and **background** colours from the swatches, or any colour you like. They go on every theme except High Contrast, which keeps its own colours. The words on a colour change only as much as it takes to stay readable, so no choice can leave something you cannot read. **Back to the theme\'s own** takes them all off.',
        '**Colour-safe colours.** Blue, orange and purple instead of green, amber and red, so good news, checks and problems stay apart with colour blindness. Each one also says what it means in words.',
        '**Font and text size.** Atkinson Hyperlegible is made to be easier to read.',
      ] },
    ],
  },
  {
    slug: 'updates',
    title: 'Updates',
    summary: 'How the app updates itself.',
    keywords: 'update upgrade version alpha test build release check restart download',
    blocks: [
      { type: 'p', text: 'The first versions of the app were **test builds**, numbered like 1.0.0-alpha.1. Version 1.0.0 is the first full release, and a test build updates to it by itself. After that, each release updates to the next.' },
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
    summary: 'The shortcuts for the menu and the screens, and how to run any command by name.',
    keywords: 'keyboard shortcut keys ctrl cmd hotkey go to command palette find a command',
    blocks: [
      { type: 'ul', items: [
        '**Ctrl+K** (Cmd+K on a Mac): Go to. Type a few letters of a screen or a book, and press Enter',
        '**Ctrl+Shift+K** (Cmd+Shift+K): Find a Command, which is Go to with the > already typed',
        '**Ctrl+N** (Cmd+N): add a book',
        '**Ctrl+Shift+I** (Cmd+Shift+I): bring in books from a file',
        '**Ctrl+E** (Cmd+E): export everything',
        '**Ctrl+,** (Cmd+,): Preferences',
        '**F1**: this Help Center',
        '**Ctrl+1, Ctrl+2, Ctrl+3**: the Desk, Books and Calendar',
        '**Ctrl+Plus, Ctrl+Minus, Ctrl+0**: zoom in, zoom out, and back to the usual size',
        '**F11**: full screen',
        '**Esc**: close a window that has opened over the page',
      ] },
      { type: 'h', text: 'Any command, by name' },
      { type: 'p', text: 'Every command in the menus can also be run from **Go to**. Press Ctrl+K, type **>**, then a few letters of what you want: **>dark** changes the theme, **>back up** backs up, and **>new book** opens the form. Each result says which menu it is in and what its shortcut is. Something that is on or off says which.' },
      { type: 'note', text: 'The menus are kept short on purpose. If you cannot find a command in them, it is here.' },
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
      { type: 'p', text: 'Removing a book, an edition or a listing moves it to the [Trash](help:trash-and-backups) for 30 days, and you can bring it back. Clashes you dismiss can be brought back. For everything else, make [backups](help:trash-and-backups).' },
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
