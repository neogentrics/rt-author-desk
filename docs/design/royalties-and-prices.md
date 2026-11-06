---
title: "Design: royalties and prices"
subtitle: The calculator, and where its rates come from
author: Recon Towers Dev Department
date: 2026-11-06
tags: [design, calculator]
---

# Royalties and prices

The calculator answers three questions: what does this price earn per copy, what should I charge to earn a given amount, and
how do the stores compare?

## What you can do

- **See a price everywhere.** Pick an edition and a price, and see the royalty per copy at each store side by side.
- **Work backwards.** Enter what you want to earn per copy and get the price at each store.
- **See the lines.** A chart of royalty per copy against price shows where a rate changes, so a price just under a line stands
  out.
- **Try a deal.** See what a promotion earns per copy, and how many copies it takes to match your usual month.
- **Check against reality.** Once reports are in, the calculator shows what a store actually took per copy next to its estimate.
  KDP's reports carry the real delivery and manufacturing cost, so the app can show when an estimate is off.
- **Find break-even.** With costs in (v1.3), how many copies at this price pay for the book.

## Rate cards

Store rates change, so they're never written into the code. Each store has dated cards, shipped as data with the app:

| Field | Example |
|---|---|
| Store, format, marketplace | KDP, paperback, Amazon.com |
| Applies from | 10 June 2025 |
| The rule | 60% of list at $9.99 or more, 50% below, less the print cost |
| Limits | Lowest and highest price, keyword and description limits |
| Source and checked on | The store's help page, and the date someone last read it |

The calculator shows the card it used and when it was checked. You can add your own or change one, and yours stays separate, so an
update never overwrites it. A sale is worked out with the card that applied on its date. Cards are checked against each store's own
pages before every release, and the app makes no connection to do it.

A contract can differ from the published rate, as with ACX. An edition can carry its own rate, and that wins.

## The first cards

These are the starting point, to be checked against each store's own pages during the build. The owner's KDP guide of October 2026
is the best source so far.

| Store | Format | Rate | Confidence |
|---|---|---|---|
| KDP | Ebook | 35% of list, or 70% less delivery cost, inside a price band | The band's top is $12.99 from 7 July 2026 by KDP's pricing page; some outside sources say $9.99 |
| KDP | Print, Amazon.com | 60% of list at $9.99 or more, 50% at $9.98 or less, less print cost | Good, for paperback. Hardcover wasn't confirmed |
| KDP | Expanded distribution | 40% of list, less print cost | Good |
| KDP | Kindle Unlimited | A rate per page read that moves each month | You enter it, or it's worked out from your reports |
| Barnes & Noble Press | Ebook | 70% of list | From its help center |
| Barnes & Noble Press | Print | 55% of list, less print cost | From its help center |
| ACX | Audiobook | Secondary sources: 50% exclusive and 30% non-exclusive since 26 May 2026, with 40% and 25% before | To check. It varies by title |
| IngramSpark, Draft2Digital, Kobo, Apple Books, Google Play Books, Lulu | All | Not looked up yet | To do in step zero |

Print cost depends on page count, ink and marketplace. A card holds the store's formula where one is published, and you can
always type the real figure from the store's own calculator.

## Rounding

Amounts are worked out in whole cents, with rounding only at the last step, the way the store's own calculator does it. Tests compare
results with the stores' own calculators for a set of real books.

## What it isn't

It's an estimate for planning. The store's report is what counts, and the calculator says so.
