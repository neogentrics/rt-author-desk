# Changelog

All notable changes to RT Author Desk are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Test builds before 1.0.0 are numbered `1.0.0-alpha.1` and so on.

## [Unreleased]

### Changed
- **The app no longer carries the project's own docs, tests and scripts.** Version 1.0.0 shipped the whole project folder inside the app (its
  docs, tests, scripts and notes, about 4 MB more than needed). A built app now holds only its source, its dependencies, its package file and its
  two license files, and a test, the built app's own self-test and the pipeline check that it stays that way. Nothing private was ever in a
  published build, which is made from a clean copy of the repository, but a build made on a computer that has private files in the folder
  would have taken them along, and now cannot.

### Added
- **Look for new versions by itself** in Preferences, under Updates. It is on, as before, and when it is off the app contacts no one: it never asks
  GitHub about a new version unless you choose Help, then Check for Updates. The design notes already said this could be turned off, and now it can.

### Fixed
- **The wording about privacy says what is true.** The app said "nothing is sent anywhere" and "a backup is safe in OneDrive or Dropbox". The
  first left out that it asks GitHub about new versions (nothing from your library goes with the question), and the second was too much: a backup holds the
  library and the key that opens it, and with no password set that key is the same wrapper in every copy of the app, so a backup is only as
  private as the folder it is kept in. The welcome page, the Help Center, Preferences, the README, SECURITY.md and the design notes now say so.

### Security
- **Files from outside are treated as hostile.** A review of how the app reads a sales report, a spreadsheet of books and a backup found and fixed:
  a number cell that started with a minus could still be run as a formula when exported to a spreadsheet; a cell of tens of thousands of spaces made
  the book import take half a minute; a sales report that declared an entity was read before it was refused; and a backup was trusted because it
  opened, when anyone can make one that opens. A backup is now read only if it is the way this app writes one (not compressed, sizes that add up),
  is a library of this app at a step it knows, and holds exactly the tables and indexes that step makes. One with a trigger, a view or a table of its
  own is refused before anything is replaced. Tests make each of these files and watch them be refused.
- **The window's locks are tested.** Only the top page of the app's own window may ask the main process for anything, every permission a page could ask
  for is refused, every page the app makes is stopped from navigating or opening a window, the page policy forbids a changed base address and any form
  sending, and a test fails if one of these is loosened, if a call is added that does not check where it came from, or if anything builds the page
  from text. Invisible and direction-changing characters in the project's files are also refused by a test.
- **The build pipeline can only do what it needs.** Every outside action is pinned to the exact commit it was checked at, the jobs that build
  can only read, a checkout no longer leaves the job's token where an installed dependency could read it, and only the last job, which
  publishes the release, may write.
- **Nothing in the environment can change where an installed app looks for updates.** It always asks this project's GitHub Releases. A
  variable left over from another app could have named a local server, and is removed. The other test hooks that are read from the environment
  are ignored by an installed copy.
- **The window of every build is opened and checked before anything is published**, on Windows, Mac and Linux, so a build that opens blank
  cannot go out.

## [1.0.0] - 2026-11-22

The catalog. Version 1.0 is the catalog and everything needed to run it on a computer every day. The owner decided, after trying the first test
build (`1.0.0-alpha.0`), that the app leaves alpha when the catalog is solid and doesn't wait for the money, which is 1.1.

### Added
- **Books and series**, under any number of pen names and publisher names.
- **Editions**: ebook, paperback, hardcover, large print and audiobook, each with its own details and release date.
- **ISBNs** with their check digits verified, who issued each one, and which edition uses it. Each number is in the register once.
- **Audiobook recordings**: human, synthesized or cloned voice, who read it, an exclusive deal and when it ends, and which
  recordings are waiting to be replaced.
- **Store listings**: an edition on a store, directly or through a distributor, with its status and dated prices in each
  marketplace. Nine stores come built in, and you can add your own.
- **The store grid**: one page per book, editions down the side and stores across the top, so a gap shows at a glance.
- **The audiobook tracker**: every audiobook on every store, with the live recording, its voice, its rights and what is
  waiting to be replaced.
- **Go to and short menus**: Ctrl+K finds a screen or a book from a few letters, and starting with > runs any command from the menus by
  name, each with where it is and its shortcut. The menus are File, Edit, View and Help, with the screens and the themes in submenus, and
  Help is in the suite's order: Help Center (F1), Tutorial, Check for Updates…, About. The View menu has every theme, Follow System, Glass
  and colour-safe colours, and changing one there changes Preferences if it is open.
- **An icon toolbar** across the top: Go to, New Book, Bring in books, the **theme button**, Preferences and Help Center. Each button has a name
  that shows when you hover and is read out by a screen reader, and a shortcut where there is one. The theme button is the moon, on every
  screen: it changes the theme (Follow System or any of the fifteen), Glass and colour-safe colours at once, and Escape closes it.
- **Accessibility, checked by tests**: every screen and window is checked by a program for names a screen reader can say, labels, headings,
  repeated ids and controls big enough to press; the keyboard order is walked (the skip link, the toolbar, the sidebar, then the page) and a
  window keeps the focus inside it; the ring around what has the focus and the border of a field are measured in every theme; Windows high
  contrast is turned on and checked; and the colour-safe colours are simulated with colour blindness. Fixed along the way: the skip link no
  longer jumps to the Desk, the first screen no longer takes the focus, a window over another window has its own name, and a field's border
  is stronger so you can see where to type.
- **Customize Theme**: your own accent, panel and background colours, from swatches or any colour, on every theme but High Contrast. The
  words on a colour change only as much as it takes to stay readable, so no choice can leave something unreadable, and a test checks that
  over hundreds of colours in every theme. Glass stays solid while your own panel or background colour is in use.
- **The About window, in full**: the icon, the name and version (marked portable if it is), four links with a line saying where each goes
  (Website, What's new in this version, Report a problem or suggest a feature, Source code), a line of Electron, Chromium, Node and
  computer versions with a **Copy details** button for bug reports, where your library is kept, and links to the License and the
  open-source notices. The copied details say nothing about you or your library.
- **People and credits**: editors, proofreaders, cover artists, illustrators, narrators, translators and formatters, credited on each
  edition. A person is kept once and can be credited on many editions, and in two roles on one. For each store you can write down which
  credits it shows. Nothing is checked until you have.
- **Clash checks**: ten kinds of real problem, such as an ebook in an exclusive program that is also on sale elsewhere, a free store ISBN
  used at another store, or an editor credited on one store and left off another. Each can be dismissed with a reason, and brought back.
- **The release calendar**, and **the Desk**, a home screen that shows the next release and what is in its way.
- **An encrypted library** in the app's own folder, with a numbered, forward-only set of upgrades and a backup copy made
  before each one.
- Installers for Windows (installer and portable), macOS (Apple silicon and Intel) and Linux (AppImage and `.deb`), built
  by CI, each checked by installing it and running a self-test.

- **Preferences** (`Ctrl+,`, or `Cmd+,` on a Mac): the suite's fifteen themes, Glass, colour-safe colours (blue, orange and purple instead of
  green, amber and red), a choice of fonts with Inter and Atkinson Hyperlegible carried with the app, and text size. Everything
  changes as it's picked and is remembered. Every theme's text is checked for contrast, on the page, the cards and the panel.
- A real menu bar: File, Edit, View and Window, with no Reload to throw away what is half typed.

- **A Help menu and Help Center** (`F1`): thirteen short guides, searchable, with answers to common questions, a list of keyboard shortcuts,
  **Report a Problem**, **Check for Updates** and **About** (which also says where your library is kept).
- **A tour of a made-up catalog.** It opens a separate sample library with a short series, a few problems to find and something coming up,
  and walks through the Desk, books, store grid, clashes, audiobooks, calendar and ISBNs. Leaving it throws it away, so it can't touch your own books.
- **The app updates itself, test builds included.** On Windows and the Linux AppImage, a newer test build downloads in the background and asks to
  restart. On a Mac and with the `.deb`, it tells you and opens the download page. Pre-releases are looked at while the app is before 1.0.0.

- **An icon of its own**: a round amber badge with a ledger on it, in a different shape and colour family from the other Recon Towers
  apps. The PNG and the Windows icon file are made from one SVG by `npm run icons`.

- **Make a series, a pen name or a publisher name right where you pick one.** The Series, Pen name and Publisher name boxes end with a
  **New…** choice. A new series made beside a new pen name is filed under it, and a save that fails never makes the same name twice.
- **Empty screens say what to do and have the button for it.** The Desk, Books, Calendar, Audiobooks and ISBNs each explain what they
  are for, and offer to add a book, date a release, add an audiobook or take a tour of a made-up catalog.

- **Bring in your books from a CSV file**, such as a Notion export. Show the app which column is which (it guesses first), see every
  book it would make and every row it would skip and why, say what any word it doesn't know means, and bring them in in one step.
  Series, formats, statuses, dates written out or as 3/1/2025, and an Amazon link (kept as a KDP listing's code, or in the notes) are understood.
  A title already in your library is skipped, so the same file twice adds nothing, and **Books you brought in** has an Undo.
- The first tests that drive the real app through its window, run in CI on Linux.

- **The installed-list file.** An installed copy leaves `installed/rt-author-desk.json` where the other Recon Towers apps look, with the app's
  id, name, **version** and the path to start it. It is written each time the app starts, so an update changes the version, and the Windows installer writes
  it too and takes it away on uninstall.

- **Backups.** In Preferences, choose a folder and how often. A backup is one file with your whole library and its key in it (so it is only as private as the
  folder it is kept in). One is only made when something has changed, the oldest go past the number you keep, and **Back up now** makes one
  whenever you like. **Restore from a backup…** checks the file first, says what is in it, and keeps your current library to one side instead of deleting it.
- **The Trash.** Removing a book, an edition or a listing moves it to the Trash for 30 days, and bringing it back returns it exactly as it was (the same
  records, ids and dates), with its prices, recordings and ISBNs. This also fixes recordings being left behind when an edition was removed.
- **Export everything** (`Ctrl+E`): your whole library as one JSON file, a spreadsheet (CSV) for each kind of thing with names filled in beside the ids and amounts
  as decimals, and each original report as it was imported, in a new folder. The library's key is never written.

### Early, for 1.1 (the money)
These are in this version, marked "early" in the menu, and nothing in the catalog depends on them.
- **A reader for Amazon KDP orders and payments reports**, used in tests with made-up files.
- **Sales reports go into the library.** Choose a KDP orders or payments report, see what it holds, and accept it as one batch.
  Rows are matched to editions by ASIN or ISBN, and anything left over is asked about once and remembered. Rows already imported
  are skipped, a whole batch can be undone, and the original file is kept encrypted inside the library.
- **Earned and paid**, side by side by currency and month. A report whose own total doesn't match its rows is shown, and stays flagged.
- **Royalties** by month, book, edition, store and marketplace, in any mix and always by currency. Estimates are kept apart from what was paid. Last month's earnings show on the Desk.
- Empty slots for the Barnes & Noble Press, ACX, Google Play Books and IngramSpark readers, which wait for a real report.

### Fixed
- Lists keep the order things were added, even when two are added in the same millisecond.
