---
title: RT Author Desk Product Plan
subtitle: What it's for, who it's for, and how it does the job
author: Recon Towers Dev Department
date: 2026-11-06
tags: [plan]
---

# Product plan

## What it's for

An author who publishes their own books runs a small business, and the work is scattered: a spreadsheet of ISBNs, a page of
store links, a folder of reports nobody opens, a note saying which ebook is in which program. Mistakes in that scatter cost
real money, and they stay hidden until a store complains or a royalty statement looks wrong.

RT Author Desk keeps that business in one place on your own computer. It knows what you've published, where, at what price
and under what terms, and what each book has earned and cost.

It was inspired by the owner writing his own books. It replaces the business side of his Notion workspace, and it's built
for any author.

## Who it's for

Any author who publishes their own work, from a first book to a long backlist across many stores. The owner's setup is one
example, and nothing about it is built in: a new author sees an empty catalog and a made-up sample.

## What the owner's Notion showed

The plan comes from reading what's there today, and what it can't do well.

| What we found | What it means for the app |
|---|---|
| A book's ISBNs, imprint, prices and file versions sit in a free-text note | They need to be real fields, and the move from Notion has to find them in the text |
| One store row holds a long list of problems found by hand, such as publisher names that differ and editors credited in one place only | Those checks can be done by the app: this is where it earns its place |
| A book reaches some stores directly and others through a distributor | A listing has to record the route, and the same sale can't be counted twice |
| Sales & Royalties has two rows, both blank | Hand-typed monthly totals don't happen. Import is the only way this gets done |
| The real KDP files carry every sale by title, marketplace, format and currency | There's far more in the reports than the monthly total Notion asked for |
| Release dates slip because of covers, not writing | A launch plan has to watch the cover first |
| A release rule exists: how far ahead to schedule, and how far apart books in a series should be | Spacing rules belong in the app, as your own settings |

## How it does the job its own way

The app is built around three ideas of its own.

**The Desk.** The home screen answers one question: what needs you today? It shows the next release and what's blocking it,
clashes, reports that are due, renewals, and last month's earnings. Most business software opens on a dashboard of totals.
This one opens on what to do.

**The store grid.** Each book gets one page with its editions down the side and its stores across the top. Each square shows
the price, the status and any problem. It's how the catalog is meant to be read, and gaps stand out at once.

**Every row accounted for.** Reports are treated like a ledger. Each row is imported, a duplicate, or set aside with a reason,
and the total has to match the store's own. When the app can't be sure, it stops and asks.

## Clash checks

Real problems the app looks for. Each says what's wrong and what to do, and can be dismissed with a reason.

| Check | Why it matters |
|---|---|
| An ebook in an exclusive program is also on sale elsewhere | It breaks the program's terms |
| A free store ISBN is used on another store | Those ISBNs can only be used with the store that gave them |
| An ISBN is on two editions, or fails its check digit | Stores reject it, or the wrong book gets the sale |
| The publisher name differs between stores, or from your records | Readers and stores see an inconsistent publisher, and it matters when a publisher name changes |
| A contributor is credited on one store and not another | Editors, narrators and artists should be credited the same everywhere |
| A series name is spelled differently on two editions | Stores won't group the books |
| A print price sits just under a royalty line | A few cents more can pay a higher rate |
| An ebook price is outside the band for the rate you want | It pays the lower rate |
| A price changes inside a deal's locked period | It can cost you the deal |
| A release date is set with no final cover or file | The usual reason a date slips |
| A pre-order deadline is near and the final file isn't marked done | Stores can cancel the pre-order |
| Two releases in a series break your spacing rule | Your own rule, set by you |

Store rules change, so these checks read from the same dated rate cards as the calculator, and each shows when it was last
checked. See [royalties and prices](design/royalties-and-prices.md).

## What's in and what's out

**In:** the catalog, ISBNs, listings, release dates, launch plans, marketing plans and results, sales reports, royalties,
costs, profit, direct sales, author copies, events, accounts, a vault for logins, the business checklist, the calculator, and
a private personal money section.

**Out, because another app owns it:** manuscripts, word counts and draft status (RT Story Tracker); interiors, covers and
print files (RT Press); audio masters (RT Audio Studio); sending to blogs, Discord, wikis and Notion (RT Markdown Reader).

**Out, because it's another job:** signing in to stores, posting to social media, sending email, full bookkeeping, filing
taxes, and advice of any kind. Substack and podcast operating notes stay out too: daily posting stays with automation, and
this app holds the plans and the results.

**One thing to note.** Personal money isn't the business of being an author, and the suite page describes this app as the
business. The owner asked for it, so it's here as a separate section that's off by default, with its own lock. It comes after
the business work, and the suite page should say so.

## Parts to share, not rewrite

| Part | From | Used for |
|---|---|---|
| App Link | `src/main/app-link.js` in Reader and Story Tracker | Link once, Apps panel, facts |
| Storage rules and encrypted database | RT Story Tracker | The library |
| The lock, recovery key, trusted computer, authenticator | RT Story Tracker's [design](https://github.com/neogentrics/rt-story-tracker/blob/master/docs/design/passwords-and-recovery.md) | The vault, the app lock, personal money |
| Backups, Trash, installers, self-update, CI | RT Story Tracker | The same way here |
| Themes and fonts | `src/shared/themes.js` | The look |
| AI services, including local models | Reader's `ai-providers.js` | AI assist |
| Claude connector | Reader, and RT Story Tracker's v3.14 plan | The connector |
| Automations | Reader's n8n and webhook work | Telling your workflows about events |
| Publishing | Reader, over App Link | Nothing is rebuilt here |

These are copied into each app for now, as the suite page says. A shared package is a suite decision, not this app's.

## How it'll be built

The same way as RT Story Tracker: Electron, `better-sqlite3-multiple-ciphers`, electron-builder, Node 22, plain tests with
`node --test`, and a test that drives the real installed app on each system. `.xlsx` reports are read with `fflate` and
`fast-xml-parser`, which RT Story Tracker already uses, so no new spreadsheet library is needed.

## What done looks like

A month of business work with Notion closed and nothing missing, and a new author who can start alone.
