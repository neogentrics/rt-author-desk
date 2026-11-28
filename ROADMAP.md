---
title: RT Author Desk Roadmap
subtitle: The business of being an author, on your own computer
author: Recon Towers Dev Department
date: 2026-11-06
tags: [roadmap, planning]
---

# Roadmap

RT Author Desk is the business side of being an author. This page lists the releases, each one something that can be tested
on its own. **The catalog (1.0.0) and the first of the money (1.1.0) are released, and building goes on.** The reasons behind it are in the
[product plan](docs/product-plan.md), and the choices are in [decisions](docs/decisions.md).

> [!TIP]
> This file is written in Markdown, so it looks best opened in RT Markdown Reader.

**Legend:** 🙋 requested by the owner · 🛡️ needs a permission step · Size: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more

**Version numbers:** new features are 1.x releases (1.10 is followed by 1.11, 1.12…). Test builds before 1.0 are numbered 1.0.0-alpha.1 and so on. The next major version, 2.0, is kept for
something as big as a companion on phones.

**Every release must:** install on a clean computer with nothing else set up, update from the release before it without
losing anything, and pass its automated tests on Windows, Mac and Linux.

| Release | Theme | Status |
|---|---|---|
| [Step zero](#step-zero--settle-the-foundations) | Settle the foundations | Built. The installers for Windows, Mac and Linux are built and checked by CI |
| [v1.0](#v10--the-catalog) | The catalog | **Released as 1.0.0 on 22 November 2026.** Contributors and credits and the suite's look and feel are built |
| [v1.1](#v11--the-money) | The money | **Part released as 1.1.0 on 22 November 2026.** KDP import and royalties, the calculator with your own rate cards, and one price check. The other stores' readers, two price checks and the test against real reports are still to do |
| [v1.2](#v12--every-store) | Every store | **Part released as 1.2.0 on 22 November 2026.** Match your columns, the notice when a kept layout no longer fits, and Reports due are built. Since then, not yet released: a Lulu reader built from Lulu's description, to be confirmed on a real file. The other readers are still to do |
| [v1.3](#v13--accounts-and-the-vault) | Accounts and the vault | Planned |
| [v1.4](#v14--what-a-book-really-made) | What a book really made | Planned |
| [v1.5](#v15--launch-a-book) | Launch a book | Planned |
| [v1.6](#v16--the-recon-towers-suite) | The Recon Towers suite | Planned |
| [v1.7](#v17--personal-money) | Personal money | Planned |
| [v1.8](#v18--claude-and-ai) | Claude and AI | Planned |
| [v1.9](#v19--leaving-notion) | Leaving Notion | Planned |
| [v1.10](#v110--two-computers) | Two computers | Planned |
| [Later](#later--only-if-needed) | Only if needed | Ideas |
| [Ongoing](#ongoing--polish--distribution) | Polish & distribution | Ongoing |

## Step zero — Settle the foundations

Not a release: the choices that are expensive to change later.

| Task | Size | Details |
|---|:-:|---|
| Project setup | M | The app in this repo, with tests, CI on all three systems and a clean README, built the way RT Story Tracker is. |
| Storage rules | M | Permanent IDs, a change log, removal markers and room for key slots, from the first table. Sync and the lock can't be added later. |
| Money rules | S | Every amount is a whole number of the currency's smallest unit, with its currency beside it. Never a floating-point number. |
| 🙋 Real reports | S | The owner downloads a recent report from each store, and they become private test files. Most report layouts haven't been seen yet. |

**Test:** an empty app installs and opens on all three systems, and a real KDP report opens in a test with every sheet read.

## v1.0 — The catalog

🙋 The owner decided, after trying the first test build, that the app leaves alpha when the catalog is solid, and doesn't wait
for the money. v1.0 is the catalog, with everything needed to run it on a computer every day. The money is
[v1.1](#v11--the-money).

**Where it stands (22 November 2026).** Released as **1.0.0**. The first test build (alpha.0) was installed and used on
a real computer, and what it showed was missing is now done: Preferences with the suite's themes, Glass, colour-safe colours, fonts and text
size; a Help menu and Help Center with a tour of a made-up catalog, About, and updates that include test builds; an icon of its own;
series, pen names and publisher names made right where a book asks for one; screens that say what to do when they're empty; and bringing
in books from a CSV file. The catalog also has backups, a Trash for 30 days, a way to get everything out as CSV and JSON, the
installed-list file with its version, and a short welcome the first time. It works on a made-up catalog and has been driven end to end by
tests, and the Windows and Mac installers are built and checked by CI.

**Contributors and credits (22 November 2026).** The owner held 1.0.0 for them, and they are built: editors, cover artists, narrators and
others are credited on each edition, each store's credits can be written down, and a store that leaves someone off is pointed out. Ten of the
fifteen clash checks are built. The two price checks and the locked-period check come with the calculator in v1.1, and the pre-order and
spacing checks with launch plans in v1.5. The Money and Royalties screens are in the menu marked "early": they are v1.1's work, started
early.

**The suite's look and feel (22 November 2026).** The owner asked that every app follow the suite's
[look-and-feel standard](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md), with RT Markdown Reader as the
reference, and it is built: the themes, Follow System, Glass, colour-safe colours, Customize Theme and fonts; Preferences; short menus with
Help in the suite's order; Go to and the Ctrl+K command palette; an icon toolbar with a visible theme button; the Help Center and tour; the
full About window; updates with "Restart to update"; and accessibility that is checked by tests, not by eye. Not built: the Apps status
icon at the right end of the toolbar, which the suite asks this app to build early. Whether it comes before 1.0.0 or with the suite
release (v1.6) is the owner's call. Changeable shortcuts and an adjustable toolbar wait for RT Markdown Reader's 3.13
to ship. Themes and looks are being brought in line with the suite's shared theming rules, which also adds the Metallic look, in this app's next release, after the owner's current RT Story Tracker work is done. The owner has decided on one shared theme package, with this app's extra themes added to it. Both are listed under Ongoing.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Books and series | M | Works for one novel or a long series, under any number of pen names and publisher names. A new series, pen name or publisher name can be made right where a book asks for one. A book can be planned, in progress, live, pulled or being reworked. |
| 🙋 Editions | M | Ebook, paperback, hardcover, large print and audiobook, each with its own details: page count, trim size, narrator. |
| 🙋 Contributors and credits | M | Editors, narrators, artists and others, credited on each edition and on each store, with the check that finds one credited differently on two stores. A store is only checked once its credits have been written down. Built. |
| 🙋 Store listings | L | An edition on a store: its store ID, price in each marketplace, link, status, the publisher name the store shows, and how it got there, directly or through a distributor. |
| 🙋 Recordings | M | Each audiobook recording of a book: human or synthesized voice, who read it, and what rights it has, such as an exclusive deal and when it ends. [How it works](docs/design/data-model.md#recordings). |
| 🙋 Audiobook tracker | M | Every title on every store: which recording is live, its voice, its rights, and which are waiting to be replaced and by what. |
| 🙋 ISBNs | M | Every ISBN you own or were given, who issued it, where it can be used and which edition has it. Check digits are verified. |
| 🙋 The store grid | M | One page per book: editions down the side, stores across the top, so a gap or a wrong price shows at a glance. |
| 🙋 Clash checks | M | Finds real problems: see [the list](docs/product-plan.md#clash-checks). You can dismiss one with a reason. |
| 🙋 Release dates | S | Per edition and per store, on a calendar. |
| The Desk | M | The home screen: what needs you today. The next release and what's blocking it, and clashes. |
| 🙋 Bring in your books | M | From a CSV file, such as an export from Notion: show the app which column is the title, the series, the status and so on, check what it found, and accept. Nothing changes until you do, and an import can be undone. |

**For every app**

| Feature | Size | Details |
|---|:-:|---|
| Encrypted from the start | M | The library is an encrypted database, so another program can't read it just by opening the file. A password, in a later version, is what makes it a real lock. |
| 🙋 Get it all out | M | Everything as CSV and JSON, at any time. |
| Backups and Trash | M | On a schedule, to a folder you choose, plus Trash for 30 days. |
| Installers & updates | M | Windows, Mac and Linux, as in RT Story Tracker. The app checks for updates itself, test builds included, so an installed test build updates to the next one. |
| 🙋 Preferences, themes & fonts | M | The suite's themes, Glass, colour-safe colours, fonts and text size, in a Preferences window (Ctrl+,). |
| 🙋 Help Center | M | A Help menu (F1): short searchable guides, a first-run tour of a made-up catalog, About, and Check for Updates. |
| 🙋 Short menus and a command palette | S | File, Edit, View and Help, with rarely used commands in submenus, and every command can be run by name with Ctrl+K, then `>`. Help is in the suite's order: Help Center (F1), Tutorial, Check for Updates…, About. **Built.** |
| 🙋 The About window, in full | S | The icon, name and version, links to the website, what's new, reporting a problem and the source code, a line of Electron, Chromium, Node and system versions with a Copy details button, and links to the license and the open-source notices. **Built.** The website link goes to the Recon Towers projects page until the app has a page of its own. |
| 🙋 Themes, the rest of the standard | M | Follow System, Customize Theme (your own colours), and a theme button on the main screen, beside the themes, Glass and colour-safe colours already built. **Built.** Whatever colour is chosen, the words on it are changed only as much as it takes to stay readable, and a test checks that over hundreds of colours in every theme. |
| 🙋 An icon toolbar | S | Icon buttons for the common commands, each with a name on hover that screen readers read out. **Built:** Go to, New Book, Bring in books, the theme button, Preferences and Help Center. |
| Accessibility checks | S | Every button has a name and every theme meets WCAG AA contrast, checked in the tests, and Windows high contrast and full keyboard use too. **Built.** A program checks every screen and window for names, labels, headings and controls big enough to press, walks the keyboard order, measures the focus ring and the borders of fields in every theme, turns Windows high contrast on, and simulates colour blindness. |
| 🙋 An icon of its own | S | A ledger on a desk, in a different shape and colour family from the other apps, made from one source file by a script. |
| A simple first run | S | A short welcome the first time: start your catalog, bring in a file, or look around a made-up one. |
| Installed list | S | Leaves the small file that tells the other apps it's installed, and which version is installed. It is written each time the app starts, so an update changes it, and the Windows installer writes it too. |

**Test:** bring in a real catalog from a CSV file, then find every known clash. Mark a recording as exclusive to one store, list
it on another, and see the clash. Change the theme, font and text size, and they're still changed after a restart. Install an
earlier test build and update it from inside the app. Take a backup, delete a book, and bring it back from Trash and from the
backup. Export everything and find it all in the files.

## v1.1 — The money

🙋 The sales reports, and what the books earn. It follows the catalog, so a problem here never holds up the catalog's release.

**Where it stands (22 November 2026).** Part of it is released as **1.1.0**, with the money screens marked early. KDP's orders and
payments reports go into the library: one batch at a time, rows matched to editions by ASIN or ISBN (with one question for the
rest), rows already imported skipped, a whole batch undoable, the original file kept encrypted, and earned shown beside paid. A
report whose own Summary doesn't match its rows is shown, refused unless you say you know, and flagged for good. The Barnes &
Noble Press, ACX, Google Play Books and IngramSpark readers are empty slots that say they are waiting for a real report.
Royalties by month, book, edition, store, marketplace and currency are built too, with the estimates kept apart from what was
paid, and last month's earnings on the Desk. The calculator is built and tested to the cent against worked examples, and has its own screen (marked early): what a price earns
per copy at KDP, Barnes & Noble Press and ACX from dated rate cards, side by side, the price that earns what you want, the lines where a rate changes,
and each rate saying where it came from and whether it was read on the store's own page. Your own cards are kept apart from the shipped ones, and
can be made, changed and removed on the screen. The remaining price checks, the other stores' cards and readers, and the test against real reports are still to do, and ship in the next updates. 1.1.0 also
carries the security work done since 1.0.0 (files from outside treated as hostile, the window's locks tested, a switch for the update check, and the privacy wording
made true). The open finding about the sample KDP report is in
[decisions](docs/decisions.md#to-check-before-or-during-the-build).

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Read sales reports | L | KDP (built, on made-up files), and empty slots for Barnes & Noble Press, ACX, Google Play Books and IngramSpark that wait for a real report. Choose a file, see what it holds, and accept it. [How it works](docs/design/report-imports.md). |
| 🙋 Every row accounted for | M | Built for KDP. Each row is imported, a duplicate, or set aside with a reason. Totals are checked against the report's own. Importing twice does no harm, and any import can be undone. |
| Matching | M | Built for KDP. Report rows are matched to editions by ISBN or store ID. What it can't match, it asks about once and remembers. |
| 🙋 Royalties | L | Built. By month, book, edition, store, marketplace and currency. Estimates are kept apart from what was actually paid. |
| Currencies | M | Amounts stay in the currency they were earned in. Paid amounts use the rate on the store's payment report. |
| 🙋 Royalty and pricing calculator | L | Built and tested, with its screen and your own cards; the chart and the promotion test are still to do. What a price earns per copy at each store, side by side, and what to charge to earn a given amount. Rates are dated cards that show where they came from and when they were checked, and you can change them. [How it works](docs/design/royalties-and-prices.md). |
| Price checks | S | The three clash checks that read the rate cards. Built: a price just under a royalty line, such as a paperback at $9.98 where KDP's rate goes from 50% to 60% at $9.99, which says what stepping over earns. Still to do, and each needs to be told more than the catalog holds: an ebook price outside the band for the rate you want (it needs to know the rate you want), and a price that changes inside a deal's locked period (it needs to know what is locked, and until when). |
| Reports in the export | S | Each original report as you imported it, along with everything else. |

**Test:** import two years of real KDP reports: every row is accounted for, and each month's total matches the report to the cent.
Import the same file again and nothing changes. Undo a batch. A price worked out by the calculator matches the store's own
calculator for a set of real books.

**Still needed from the owner to finish it:** a real report from each of Barnes & Noble Press and ACX, a Google Play Books report that has dates, IngramSpark's report of sales (the invoices report is not it), a recent
KDP report with pages read, what "the rate you want" means for the ebook price check, and what is locked (and until when) for the locked-period check.
Four of the eight shipped rate cards (B&N ebook and print, KDP ebook before 7 July 2026, ACX's old rates) were not read on the store's own page, and the
Calculator says so for each.

## v1.2 — Every store

🙋 Sales from everywhere you sell, and no store left typed in by hand.

**Where it stands (27 November 2026).** The first reader built from a store's own description is done, for **Lulu's sales report** (not yet in a release). It was made from [Lulu's help page](https://help.lulu.com/en/support/solutions/articles/64000262744-creator-revenue-guide) and tested on made-up files, so it is **still to be confirmed on a real file**. [What each store says its report holds](docs/design/store-report-layouts.md) gives the order for the rest. Match your columns is built: for a store with no reader, choose its report (a CSV or an Excel file), say which store it is from and which column is which, and see every row accounted for before anything is saved. The columns can be kept by their headings, so the next report from that store is recognized, and when a store renames a column the app says which one has gone and never reads past it by guessing. It is for stores with no reader yet; a reader built from a real report is better when there is one. Reports due on the Desk is built too. Draft2Digital's reader can be built from its description. Kobo's and Apple Books' wait for a real report, because neither store lists its columns. Two samples have come in: Google Play Books' Sales Summary report (tab-separated, UTF-16, with no date and no currency in it) is recognized by its headings and asks for the month and currency; IngramSpark's report turned out to be a list of invoices, which are bills and not sales, so the report of sales is still needed.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Lulu reader | M | Built from Lulu's description of its 30 columns, **to be confirmed on a real file**. Only your payee's lines are saved (it asks which is you when it can't tell). A later download updates sales that have since been paid and counts nothing twice. What Lulu marks as paid counts as paid, and its converted amounts are kept as paid or estimated, never added together. Lulu's report has no ISBN, so books are matched by its Product ID. |
| 🙋 More readers | L | Draft2Digital can be built from its description. Kobo and Apple Books each need a real report to build from. |
| 🙋 Match your columns | M | Built. For any other store: show the app which column is the date, the title and the money, and it remembers that store's layout. CSV and Excel; a day or a month for the date, either number style, a fixed currency for a file with none; a line with no title (a total or a note) is set aside and named, and a cell it cannot read stops the import and names the row. |
| Layout changed | S | Built for layouts you have kept. When a store changes its report, the app says which column has gone and which is new instead of guessing, and offers Match your columns again. (KDP's own reader already refuses a changed layout in words.) |
| Reports due | S | Built. The Desk lists each store whose next report is ready to download (a month's report is there once the month is over), with how long it has been ready and a link to import it, and notes when the others come. A store with nothing imported for over a year is taken to be one you have left. |
| 🙋 Where to sell | S | A page for an author who has no account yet: each store, what it sells (ebooks, print, audiobooks), whether it asks for exclusivity, and a link to its own site and sign-up, which opens in your browser. The app signs in to nothing, takes no commission and carries no affiliate links. It is a short list kept in the app, with the date each link was last checked, and it grows with the stores the app can read. The list is in [the report layouts note](docs/design/store-report-layouts.md). |

**Still needed from the owner:** a real Lulu sales report, to confirm its reader (the exact headings, how a refund and a date are written, and that the totals match Lulu's own).

**Test:** import a real report from each store. Rename a column in a test file: the app refuses it and says which column,
and nothing is half imported.

## v1.3 — Accounts and the vault

🙋 Every service the business uses, and the logins for them, kept safe.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Accounts | M | Each store, marketing and business service: what it's for, its login email, account number, plan, status and priority. |
| 🙋 What it all costs | S | Yearly cost, renewal dates and reminders on the Desk. |
| 🙋 Business checklist | M | The setup jobs for a publishing business, with dates, costs and what's waiting on what. Works for any author, with a template. |
| 🙋🛡️ The vault | L | Logins, kept behind their own password. It locks by itself, copied passwords clear from the clipboard, and it's never reachable by App Link, AI or an export you didn't ask for. [The design](docs/design/vault-and-privacy.md). |
| 🙋 Ways back in | M | A recovery key shown once, a trusted computer, and an authenticator, using RT Story Tracker's design. |
| 🙋 Lock the app | S | A password on the whole app, locking when idle, with the same ways back in. |

**Test:** search a copied library for a known password and find nothing. Recover using each way in. Get an independent
review of the vault before release, and the owner decides whether it's enough.

## v1.4 — What a book really made

🙋 What a book earned, less what it cost.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Costs | M | Covers, editing, narration, ads, ISBNs and subscriptions, for a book, a series or the whole business, with the receipt attached. |
| 🙋 Profit per book | M | Earnings less costs, per book and per series, and when it broke even. Shared costs are split the way you choose. |
| 🙋 Direct sales | M | Sales at signings, library tables and from your own site, typed in or from a file. |
| 🙋 Author copies | M | Stock you've bought, where it went, and what each copy cost you. Giveaways are counted too. |
| 🙋 Events | S | A date, a place, what you took, what you sold and what it cost to go. |
| Read-through | S | How many readers of book one went on to book two, from your own sales. |
| 🙋 Year-end summary | M | Income and costs by category, as a file for your taxes or your accountant. It gives no tax advice. |

**Test:** a book's profit, worked out by hand from real reports and costs, matches the app. Sell ten copies at an event
and see the stock and the money both change. The year-end summary adds up to the monthly figures.

## v1.5 — Launch a book

🙋 From a finished manuscript to a book on sale, with nothing forgotten.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Launch plans | L | Dated tasks worked back from the release date, from your own templates. Move the date and the tasks move. |
| 🙋 What's blocking it | M | Cover, final files, proofs and pre-order deadlines, shown on the Desk. Covers are checked first, because they're the usual hold-up. |
| Release spacing | S | Your own rules, such as how far apart books in a series should be, with a warning when a date breaks one. |
| 🙋 Listing kit | L | One description, keyword list and category list per book, and a version for each store, checked against that store's limits, with a Copy button for each field. The app never signs in to a store. **Other apps depend on it:** RT Press asks for a book's description from here, for its back-cover blurb, and keeps no copy of its own. Press needs it in its v1.3, so the description is the part to have first. |
| 🙋 Writing patterns | M | A check on blurbs, descriptions and promo copy for the habits that make writing sound machine-made or careless: repeated words and phrases, repeated sentence openings, very even sentence lengths, stock phrases, and your own list of phrases you never want to see. The first layer runs on the computer with no AI, offline, and every flag says why ("used 6 times in this description"). You accept, reject or ignore each mark, and nothing is changed for you. The banned-phrase list is shared with the other apps, and can be exported as a "never write these" block to paste into an AI session. An optional AI pass, off until you turn it on, uses your choice of AI. The app makes no promise about getting past AI detectors. **Waiting for the owner's go:** the suite sets this out in [the suite notes](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md), and nothing is built until the owner says. |
| Listing checklists | M | Your own checklist for each store, ticked per edition, with a template to start from. |
| 🙋 Campaigns | M | Ads, promotions and deals: the channel, book, dates and budget. |
| 🙋 Results | M | What a campaign spent against what the book earned over the same dates. Ad reports come in through Match your columns. |
| 🙋 Audience | S | Mailing list, followers and downloads over time, from a file or typed in. |

**Test:** plan a real launch, move its date and watch the tasks follow. Paste a store's listing from the kit with no field
over its limit. Compare a campaign's spend against its sales.

## v1.6 — The Recon Towers suite

🙋 The apps know each other, and each fact has one home. Built to
[the suite's rules](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md). What's needed is in
[working with the suite](docs/design/working-with-the-suite.md).

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Link once | M | App Link, with the same rules as the other apps. Off until you turn it on. |
| 🙋 Apps panel | M | The same panel as every app, with a small status icon to open it: what's on this computer, what's running and what's linked. Copied from RT Story Tracker's panel and wording when it exists. |
| 🙋 Updates and compatibility | M | The Apps panel also tells you when another app has a newer version. Two apps link or not by their App Link version and the kinds of document they accept, never by the app's own version number, so an update never breaks a link. **Update available** ("you have 3.7.1, the latest is 3.9.0") is only a nudge, and the only thing that stops a link is an App Link too old to talk to, which says **Needs an update to link**. The latest versions come from one small file on the Recon Towers site, planned at `https://recontowers.com/apps/versions.json`. It is read only when the panel opens or the app starts, and kept for a day. Nothing about you is sent, no ids and no list of what is installed. When it can't be reached, the panel says **Couldn't check for updates** and carries on. [How it works](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md#updates-and-compatibility). |
| 🙋 Saying what it does with each kind | S | `hello` also returns `kinds`: the kinds of document this app does something with, so another app only offers an action this one handles. Today this app sends and receives nothing over App Link, so it would answer `[]`. **Waiting for the owner's yes:** the suite is proposing this addition to App Link, and nothing is built until it's agreed. |
| 🙋 Link a book | S | Tie a book here to the same book in RT Story Tracker. Each app keeps working without the other. |
| 🙋 Writing progress | M | Word counts and draft status from RT Story Tracker, shown on the book and the Desk. |
| 🙋 Published facts | M | Editions, ISBNs, dates, prices and links, for RT Story Tracker's catalog to show. |
| 🙋 Give a book's description | S | RT Press asks for a book's description over App Link, and this app answers, so Press keeps no blurb field of its own. It needs the Listing kit's description (v1.5) and Link once (this release), and the answer to `hello` naming the description as a kind this app handles. **Target: with the rest of this release.** v1.5 alone isn't early enough, because the hand-over needs App Link, which is here. **To bring it forward** (the owner decides): build the description field on its own, as a small step before v1.3 (a day, no new design), and Link once with `kinds` straight after it (a few days), ahead of the Apps panel and the rest of this release. Nothing is built until the owner says. |
| 🙋 What was made | M | RT Press and RT Audio Studio tell this app when a print file or an audiobook is finished, and you accept it onto the edition. A new recording from RT Audio Studio arrives with its voice type, ready to replace one that's waiting. |
| Publish through RT Markdown Reader | S | Hand a launch post or a press kit to RT Markdown Reader, which sends it on. This app builds no publishing of its own. |
| Automations | M | Webhooks and n8n can be told about a release, a report or a due date. Off until you turn it on, and the vault and personal money stay out. |

**Test:** install each app on a clean computer, in either order, and each finds the other. A locked RT Story Tracker project
answers nothing. Change an ISBN here and see it in RT Story Tracker's catalog. Put a newer version of one app in a test copy of the versions file: the panel says **Update available** with both numbers, and a link between the two still works. Go offline: the panel says **Couldn't check for updates**, and nothing else changes.

## v1.7 — Personal money

🙋 Your own budget, bills and debts, kept apart from the business. Off until you turn it on, and it stays hidden from anyone
who doesn't want it. [The design](docs/design/vault-and-privacy.md#personal-money).

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Its own lock | M | A separate key. Business totals never include it, and it has no part in the business's exports. |
| 🙋 Bank files | L | Import CSV, OFX and QFX files, with duplicates caught across files. Any bank, and no bank login. |
| 🙋 The feed folder | M | Your own automation can leave sealed files in a folder you choose, and the app takes them in. The app opens no network port and never holds a bank login. |
| Categories | M | Rules you control. Transfers between your own accounts and debt payments are kept apart, so they don't count as spending. |
| 🙋 Budget | M | Targets per category against what you've spent this month. |
| 🙋 Bills and debts | M | What's due, when, and what's left to pay. |
| 🙋 Subscriptions | S | Every recurring charge, personal or business, found from your bank files. |
| 🙋 Cash ahead | M | Where your balance is heading by month end. These are sums from your own numbers, not advice. |

**Test:** import real bank files twice and count nothing double. A transfer between two of your accounts isn't spending.
Leave a sealed file in the folder and it's taken in with the app closed and reopened. Business totals are the same with the
section on and off.

## v1.8 — Claude and AI

🙋 Must come before leaving Notion, because Claude reads and updates this work there today. AI is an add-on: it's off until you
turn it on, and the app is complete without it.

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Connect Claude | L | Claude Desktop and Claude Code can reach the catalog, launches and earnings, through a connector you add in one click. The vault is never reachable. |
| 🙋🛡️ Your choice of access | M | **Off** (the default), **Read only**, **Suggest** (you accept or reject each change), or **Read and write**. Personal money has its own switch, off unless you turn it on. |
| A record of changes | S | Every change an AI makes is labelled and can be undone. |
| AI assist | M | Draft a description, suggest keywords, or explain a month's numbers. You see what would be sent, and you accept the result. |
| 🙋 Your choice of AI | M | Claude, ChatGPT, Gemini, Mistral, OpenRouter, or a local model through Ollama or LM Studio. Your own account and key, using RT Markdown Reader's way of doing it. |

**Test:** a Claude session reads a book's listings, suggests a change, and it appears to accept, then at each other level.
It can't reach the vault at any level. Draft a description with a local model and the computer offline.

## v1.9 — Leaving Notion

🙋 The goal. Everything is ready, so now it moves.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Bring it in | L | Reads Notion's own export files, with no token. Catalog, accounts, campaigns, the business checklist and personal money. |
| 🙋 Notes into fields | M | ISBNs, prices and dates written in free text are found and offered as fields. You accept each one, and the note is kept whole. |
| Check it matches | M | A report: every page counted, and anything that didn't land. |
| Share with RT Story Tracker | S | Writing status stays with RT Story Tracker's own move from Notion, so neither app takes the other's facts. |

**Test:** a month of business work with Notion closed, and nothing missing.

## v1.10 — Two computers

🙋 The same desk on a desktop and a laptop, with no account.

| Feature | Size | Details |
|---|:-:|---|
| 🙋🛡️ Sync | L | Encrypted, through a folder you already sync, as in RT Markdown Reader. |
| Both changed it | M | When both computers changed the same thing, you choose. Money is never merged by guessing. |
| Choose what travels | S | The vault and personal money stay on one computer unless you say otherwise. |

**Test:** change different things on two computers offline, reconnect and check both. Then change the same price on both.

## Later — only if needed

💡 Ideas kept for later, if people ask for them.

| Feature | Size | Details |
|---|:-:|---|
| Contracts and rights | M | Contracts with their dates and terms, and which rights you hold for each book and territory. |
| Rate alerts | S | A note in a release when a store's published rates change. |
| Companion on phones | L | See the Desk and log a sale at a table. It would be version 2.0. |
| Shared desk | L | An assistant or a co-author in the same catalog. It needs a service in the middle. |
| Add-ons | L | Extra readers and reports you can add to the app, as in RT Markdown Reader. |

## Ongoing — Polish & distribution

| Feature | Size | Details |
|---|:-:|---|
| Code signing | S | Windows and Mac, as for the other apps. |
| Tutorial & Help Center | M | A first-run tutorial and a Help Center that grow with each release. Any author has to be able to start alone. |
| Accessibility | S | Screen readers, contrast and keyboard use, checked in the tests. |
| 🙋 Themes and looks, to the shared rules | M | Built to [the suite's theming rules](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-theming.md), which replace this app's own theme notes. The themes and the Solid and Glass looks are built, with Customize Theme and Colour-safe, and every theme's contrast is tested. **Still different from the rules:** Light and Dark become Paper and Night, and Follow System becomes Auto; this app's own colour names (`--bg`, `--ink`, `--surface`) give way to the shared tokens (`--desk`, `--chrome`, `--page`, `--text` and the rest); the Metallic look is added beside Solid and Glass; and a test measures real text over every look in every theme, not only each theme on its own. **The owner decided (this change):** the suite keeps **one shared theme package**, and this app's extra themes (Slate, Plum, Evergreen, Aero and Blue/Orange) are added to the shared set so the other apps can use them too. The Metallic look is **needed** and is built **in this app's next release**, using the shared package. Aero has the Glass look built into the theme itself, so it needs sorting out when it joins the shared set, where a look is a separate layer. **Where the shared files live:** the private repo `neogentrics/recon-theme`. An app takes them in with a script that copies the files at a pinned tag and writes a `theme.lock`. The app commits both, so building never needs access to that repo, and a test fails if the copy differs from the lock. This app's extra themes go into that repo when the files are moved there, after RT Markdown Reader's 3.13.x look update merges. Nothing is built yet: the work waits until the owner's current RT Story Tracker work is done. |
| Changeable shortcuts | S | Change any keyboard shortcut in Preferences, as in the other apps. |
| Adjustable toolbar | S | Hide, reorder and shrink the toolbar buttons, copied from RT Markdown Reader's 3.13 once it ships. |
| Rate cards | S | Rates checked against each store's own pages before each release. |
| Report layouts | S | Readers updated when a store changes its reports. |
| Languages | L | The app in Spanish, French and German, with right-to-left layouts. All the app's words are kept in one table for each feature from the start, so this stays cheap. |
| Recon Towers App Store | S | Listed once 1.0 is out. Until then it stays on The Bench. |

## Open decisions

The full list is in [docs/decisions.md](docs/decisions.md).
