---
title: "Design: reading sales reports"
subtitle: Every row accounted for
author: Recon Towers Dev Department
date: 2026-11-06
tags: [design, reports]
---

# Reading sales reports

You download a report from a store and drop it into the app. It never signs in to a store, which is why it needs no outside
accounts and keeps working when a store changes its website.

## What happens to a file

1. **Recognize it.** The app works out the store and the report from the file's sheets and columns, never from its name.
2. **Check the layout.** If a column it needs is missing or renamed, it stops and says which. It doesn't guess.
3. **Show what's in it.** The period, the number of rows, the totals, and what's new.
4. **Match rows to editions** by ISBN or store ID. What it can't match, it asks about once and remembers.
5. **Check the total.** The rows must add up to the report's own summary, per currency.
6. **Accept.** You accept the batch, and it's saved in one step. Nothing is ever half imported.

## Every row accounted for

Each row ends up as one of these, and the import report lists them:

| Outcome | Meaning |
|---|---|
| Imported | A new row, saved |
| Duplicate | Already here, from this or another file |
| Replaced | The store corrected it, and you agreed |
| Set aside | Kept with a reason, such as a title nobody has matched yet |
| Not a sale | A heading, a total or a definition row |

The counts have to add up to the rows in the file. If they don't, the import fails and nothing is saved.

**Importing twice does no harm.** A file has a fingerprint, and so does each row, so the same file, or two reports that overlap,
count once. **Any import can be undone** as a batch.

## The stores

| Store | What's known | In |
|---|---|---|
| KDP | Real files read: see below | 1.1 |
| Barnes & Noble Press | Not seen yet. A reader is built from its help page's list of 17 columns, to be confirmed on a real file: see below | 1.1 |
| ACX | A monthly earnings statement as a multi-sheet Excel file, and a CSV from Sales Overview (its help pages). Not seen yet. Final figures arrive at the end of the following month | 1.1 |
| Google Play Books | Not seen yet. It's a report from Partner Center, including audiobooks | 1.1 |
| IngramSpark | Not seen yet | 1.1 |
| Lulu | Not seen yet. A reader is built from its help page's list of 30 columns, to be confirmed on a real file: see below | 1.2 |
| Draft2Digital, Kobo, Apple Books | Not seen yet | 1.2 |

### What a KDP report holds

Two real files were read for this plan, from December 2024. KDP may have changed them since, so step zero checks a recent one.

**The orders workbook** has nine sheets:

| Sheet | Used for |
|---|---|
| Report Definitions | Skipped. It's how the app recognizes the file |
| Summary | Totals by date, in each currency, used to check the rows |
| Combined Sales | Every royalty row: date, title, author, ASIN or ISBN, marketplace, royalty type, transaction type, units sold, refunded and net, list and offer price, delivery or manufacturing cost, royalty, currency |
| eBook Royalty, Paperback Royalty, Hardcover Royalty | The same rows by format, with file size for ebooks and order date for print |
| Orders Processed, eBook Orders Placed | Order counts, including free units |
| KENP Read | Pages read by date, title and marketplace |

Three things to handle: the royalty date is a month, such as `2022-12`, rather than a day. Transaction types include standard
sales, free promotions and countdown deals, so a free copy doesn't count as a sale. And the report calls its figures **estimated**.

**The payments workbook** has one sheet with the sales period, marketplace, payment number, date, method, currency, accrued
royalty, tax withholding, adjustments, net earnings, exchange rate and payout amount. This is the final word on what was paid,
and it's the source of exchange rates. Its header has `Currency` twice, so columns are read by position there, and a test
guards it.

### Barnes & Noble Press's sales report

Built from the column list in [what each store says its report holds](store-report-layouts.md), not from a file.

- **Two currencies.** A row's money is Total Royalty, in the Payment Currency. List Price is taken to be in the Selling Currency and is kept with that currency. The report does not say which currency Print Cost is in, so it is only kept when the two are the same.
- **Its own sum.** Net Units Sold times Unit Royalty, rounded once to the payment currency, must equal Total Royalty. A row that does not is a problem on the report, handled like a total that disagrees.
- **The same row again.** A row's fingerprint is its day, book, format, list price and two currencies, never its counts. A later copy with at least as many copies sold and returned, and more of one, updates it (**Replaced**). Any other difference is set aside and shown.
- **Not confirmed.** The exact headings, whether anything sits above them, how a return is written, and that there really is only one row for a book, day and price in each pair of currencies.

### Lulu's sales report

Built from Lulu's description, not from a file. [What each store says its report holds](store-report-layouts.md) lists the columns.

- **One row for each payee.** Only the owner's lines are saved. The others are set aside with the payee named. The app asks when it can't tell, and remembers from the lines already saved.
- **Money.** Earned is Payee Revenue, which Lulu says is in the sale's currency, after its share and any tax withheld. Converted Revenue is that in the payment currency: an estimate until Paid is `y`.
- **The same sale again.** A row's fingerprint is made from what the sale is (its reference, product, version, type, day, payee, channel, region, currency, quantity and prices), not from what has been paid. A later copy that is newly paid updates the row, which is the **Replaced** outcome. Pressing Import is the agreement, and the batch keeps the old figures so Undo can put them back. A copy that is not newly paid and disagrees about the amount is set aside and shown.
- **Not said by Lulu.** How a refund is signed (so a refund is taken off either way) and how the sale date is written (so an unclear order is asked for).

## Estimates and payments

Stores report a sale first and pay for it later, sometimes months later and in another currency. The app shows both:

- **Earned:** what the reports say, by the month of the sale.
- **Paid:** what reached you, by the date it was paid.
- **Owed:** earned but not yet paid.

Lulu has no separate payment file here: its sales report says line by line what has been paid, and those lines count as paid.

When a payment arrives, the app matches it to its sales period and shows any difference.

## Match your columns (1.2)

For a store with no reader. You open a file, point at the columns for the date, title or ID, units, money and currency, and name
the store. The app saves that as a layout, and the same checks apply. A layout can be exported and shared.

## Testing

- Real reports are private test files and never go in the repo. Tests in the repo use made-up files with the same layouts.
- Every reader has tests for a duplicate file, an overlap, a renamed column, an empty month, a refund, and a total that doesn't
  match.
- A test checks one real year by hand against the store's own dashboard.
