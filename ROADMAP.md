---
title: RT Author Desk Roadmap
subtitle: The business of being an author, on your own computer
author: Recon Towers Dev Department
date: 2026-11-06
tags: [roadmap, planning]
---

# Roadmap

RT Author Desk is the business side of being an author. This page lists the releases, each one something that can be tested
on its own. **Building has started, on the catalog first.** The reasons behind it are in the
[product plan](docs/product-plan.md), and the choices are in [decisions](docs/decisions.md).

> [!TIP]
> This file is written in Markdown, so it looks best opened in RT Markdown Reader.

**Legend:** 🙋 requested by the owner · 🛡️ needs a permission step · Size: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more

**Version numbers:** new features are 1.x releases (1.9 is followed by 1.10, 1.11…). The next major version, 2.0, is kept for
something as big as a companion on phones.

**Every release must:** install on a clean computer with nothing else set up, update from the release before it without
losing anything, and pass its automated tests on Windows, Mac and Linux.

| Release | Theme | Status |
|---|---|---|
| [Step zero](#step-zero--settle-the-foundations) | Settle the foundations | Built. The Linux installers pass their check, and Windows and Mac wait for CI |
| [v1.0](#v10--the-catalog-and-the-money) | The catalog and the money | **In progress.** The catalog's first test build works. The money has its KDP reader only |
| [v1.1](#v11--every-store) | Every store | Planned |
| [v1.2](#v12--accounts-and-the-vault) | Accounts and the vault | Planned |
| [v1.3](#v13--what-a-book-really-made) | What a book really made | Planned |
| [v1.4](#v14--launch-a-book) | Launch a book | Planned |
| [v1.5](#v15--the-recon-towers-suite) | The Recon Towers suite | Planned |
| [v1.6](#v16--personal-money) | Personal money | Planned |
| [v1.7](#v17--claude-and-ai) | Claude and AI | Planned |
| [v1.8](#v18--leaving-notion) | Leaving Notion | Planned |
| [v1.9](#v19--two-computers) | Two computers | Planned |
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

## v1.0 — The catalog and the money

🙋 The owner chose both for the first release. It reaches him as two test builds: the catalog first, then the money. Each is
tested alone, so a problem in one doesn't hold up the other.

**Where it stands (18 November 2026).** The catalog's first test build works on the real app: books and series, editions,
ISBNs with check digits, audiobook recordings, store listings with their route and prices, the store grid, nine clash checks,
a release calendar and the Desk. It has been used by hand on a made-up library, and its tests pass. What's left in the
catalog: contributors and credits (and the clash that depends on them), the all-titles audiobook tracker, and the clash checks that need
rate cards, spacing rules or pre-order deadlines. In the money, the KDP orders and payments reader exists, and
the rest of the readers, matching, royalties and the calculator are not started. Nothing under "For every app" is built yet
except the encrypted library and the Linux installer. The open finding about the sample KDP report is in
[decisions](docs/decisions.md#to-check-before-or-during-the-build).

**The catalog**

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Books and series | M | Works for one novel or a long series, under any number of pen names and publisher names. A book can be planned, in progress, live, pulled or being reworked. |
| 🙋 Editions | M | Ebook, paperback, hardcover, large print and audiobook, each with its own details: page count, trim size, narrator, contributors. |
| 🙋 Store listings | L | An edition on a store: its store ID, price in each marketplace, link, status, the publisher name the store shows, and how it got there, directly or through a distributor. |
| 🙋 Recordings | M | Each audiobook recording of a book: human or synthesized voice, who read it, and what rights it has, such as an exclusive deal and when it ends. [How it works](docs/design/data-model.md#recordings). |
| 🙋 Audiobook tracker | M | Every title on every store: which recording is live, its voice, its rights, and which are waiting to be replaced and by what. |
| 🙋 ISBNs | M | Every ISBN you own or were given, who issued it, where it can be used and which edition has it. Check digits are verified. |
| 🙋 The store grid | M | One page per book: editions down the side, stores across the top, so a gap or a wrong price shows at a glance. |
| 🙋 Clash checks | M | Finds real problems: see [the list](docs/product-plan.md#clash-checks). You can dismiss one with a reason. |
| 🙋 Release dates | S | Per edition and per store, on a calendar. |
| The Desk | M | The home screen: what needs you today. The next release and what's blocking it, clashes, reports that are due, and last month's earnings. |

**The money**

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Read sales reports | L | KDP, Barnes & Noble Press, ACX, Google Play Books and IngramSpark. Drop a file in, see what it holds, and accept it. [How it works](docs/design/report-imports.md). |
| 🙋 Every row accounted for | M | Each row is imported, a duplicate, or set aside with a reason. Totals are checked against the report's own. Importing twice does no harm, and any import can be undone. |
| Matching | M | Report rows are matched to editions by ISBN or store ID. What it can't match, it asks about once and remembers. |
| 🙋 Royalties | L | By month, book, edition, store, marketplace and currency. Estimates are kept apart from what was actually paid. |
| Currencies | M | Amounts stay in the currency they were earned in. Paid amounts use the rate on the store's payment report. |
| 🙋 Royalty and pricing calculator | L | What a price earns per copy at each store, side by side, and what to charge to earn a given amount. Rates are dated, and you can check and change them. [How it works](docs/design/royalties-and-prices.md). |

**For every app**

| Feature | Size | Details |
|---|:-:|---|
| Encrypted from the start | M | The library is an encrypted database that nothing else can read. |
| 🙋 Get it all out | M | Everything as CSV and JSON, at any time, and each original report as you imported it. |
| Backups | M | On a schedule, to a folder you choose, plus Trash for 30 days. |
| Installers & updates | M | Windows, Mac and Linux, as in RT Story Tracker. |
| A simple first run | S | Start your catalog, or try a made-up one. |
| Themes & fonts | S | The suite's themes and fonts. |
| Installed list | S | Leaves the small file that tells the other apps it's installed. |

**Test:** enter a real catalog, then find every known clash. Mark a recording as exclusive to one store, list it on another,
and see the clash. Import two years of real KDP reports: every row is accounted for,
and each month's total matches the report to the cent. Import the same file again and nothing changes. Export everything and
find it all in the files.

## v1.1 — Every store

🙋 Sales from everywhere you sell, and no store left typed in by hand.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 More readers | L | Draft2Digital, Kobo, Apple Books and Lulu. Each needs a real report to build from. |
| 🙋 Match your columns | M | For any other store: show the app which column is the date, the title and the money, and it remembers that store's layout. |
| Layout changed | S | When a store changes its report, the app says what's different instead of guessing, and offers Match your columns. |
| Reports due | S | Each store's last report and when the next is due, shown on the Desk. |

**Test:** import a real report from each store. Rename a column in a test file: the app refuses it and says which column,
and nothing is half imported.

## v1.2 — Accounts and the vault

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

## v1.3 — What a book really made

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

## v1.4 — Launch a book

🙋 From a finished manuscript to a book on sale, with nothing forgotten.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Launch plans | L | Dated tasks worked back from the release date, from your own templates. Move the date and the tasks move. |
| 🙋 What's blocking it | M | Cover, final files, proofs and pre-order deadlines, shown on the Desk. Covers are checked first, because they're the usual hold-up. |
| Release spacing | S | Your own rules, such as how far apart books in a series should be, with a warning when a date breaks one. |
| 🙋 Listing kit | L | One description, keyword list and category list per book, and a version for each store, checked against that store's limits, with a Copy button for each field. The app never signs in to a store. |
| Listing checklists | M | Your own checklist for each store, ticked per edition, with a template to start from. |
| 🙋 Campaigns | M | Ads, promotions and deals: the channel, book, dates and budget. |
| 🙋 Results | M | What a campaign spent against what the book earned over the same dates. Ad reports come in through Match your columns. |
| 🙋 Audience | S | Mailing list, followers and downloads over time, from a file or typed in. |

**Test:** plan a real launch, move its date and watch the tasks follow. Paste a store's listing from the kit with no field
over its limit. Compare a campaign's spend against its sales.

## v1.5 — The Recon Towers suite

🙋 The apps know each other, and each fact has one home. Built to
[the suite's rules](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md). What's needed is in
[working with the suite](docs/design/working-with-the-suite.md).

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Link once | M | App Link, with the same rules as the other apps. Off until you turn it on. |
| 🙋 Apps panel | M | The same panel as every app: what's on this computer, what's running and what's linked. |
| 🙋 Link a book | S | Tie a book here to the same book in RT Story Tracker. Each app keeps working without the other. |
| 🙋 Writing progress | M | Word counts and draft status from RT Story Tracker, shown on the book and the Desk. |
| 🙋 Published facts | M | Editions, ISBNs, dates, prices and links, for RT Story Tracker's catalog to show. |
| 🙋 What was made | M | RT Press and RT Audio Studio tell this app when a print file or an audiobook is finished, and you accept it onto the edition. A new recording from RT Audio Studio arrives with its voice type, ready to replace one that's waiting. |
| Publish through RT Markdown Reader | S | Hand a launch post or a press kit to RT Markdown Reader, which sends it on. This app builds no publishing of its own. |
| Automations | M | Webhooks and n8n can be told about a release, a report or a due date. Off until you turn it on, and the vault and personal money stay out. |

**Test:** install each app on a clean computer, in either order, and each finds the other. A locked RT Story Tracker project
answers nothing. Change an ISBN here and see it in RT Story Tracker's catalog.

## v1.6 — Personal money

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

## v1.7 — Claude and AI

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

## v1.8 — Leaving Notion

🙋 The goal. Everything is ready, so now it moves.

| Feature | Size | Details |
|---|:-:|---|
| 🙋 Bring it in | L | Reads Notion's own export files, with no token. Catalog, accounts, campaigns, the business checklist and personal money. |
| 🙋 Notes into fields | M | ISBNs, prices and dates written in free text are found and offered as fields. You accept each one, and the note is kept whole. |
| Check it matches | M | A report: every page counted, and anything that didn't land. |
| Share with RT Story Tracker | S | Writing status stays with RT Story Tracker's own move from Notion, so neither app takes the other's facts. |

**Test:** a month of business work with Notion closed, and nothing missing.

## v1.9 — Two computers

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
| Rate cards | S | Rates checked against each store's own pages before each release. |
| Report layouts | S | Readers updated when a store changes its reports. |
| Languages | L | The app in other languages. |
| Recon Towers App Store | S | Listed once 1.0 is out. Until then it stays on The Bench. |

## Open decisions

The full list is in [docs/decisions.md](docs/decisions.md).
