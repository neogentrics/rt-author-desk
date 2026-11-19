# Changelog

All notable changes to RT Author Desk are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Test builds before 1.0.0 are numbered `1.0.0-alpha.1` and so on.

## [Unreleased]

Heading for 1.0, which is the catalog. The money is 1.1: the owner decided, after trying the first test build, that the app
leaves alpha when the catalog is solid and doesn't wait for the money. The first test build is `1.0.0-alpha.0`.

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
- **Clash checks**: nine kinds of real problem, such as an ebook in an exclusive program that is also on sale elsewhere, or
  a free store ISBN used at another store. Each can be dismissed with a reason, and brought back.
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

### Started early, for 1.1 (the money)
These are in the test builds, and v1.0 doesn't depend on them.
- **A reader for Amazon KDP orders and payments reports**, used in tests with made-up files.
- **Sales reports go into the library.** Choose a KDP orders or payments report, see what it holds, and accept it as one batch.
  Rows are matched to editions by ASIN or ISBN, and anything left over is asked about once and remembered. Rows already imported
  are skipped, a whole batch can be undone, and the original file is kept encrypted inside the library.
- **Earned and paid**, side by side by currency and month. A report whose own total doesn't match its rows is shown, and stays flagged.
- **Royalties** by month, book, edition, store and marketplace, in any mix and always by currency. Estimates are kept apart from what was paid. Last month's earnings show on the Desk.
- Empty slots for the Barnes & Noble Press, ACX, Google Play Books and IngramSpark readers, which wait for a real report.

### Fixed
- Lists keep the order things were added, even when two are added in the same millisecond.
