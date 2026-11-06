---
title: RT Author Desk Decisions
subtitle: What's settled and what's waiting for the owner
author: Recon Towers Dev Department
date: 2026-11-06
tags: [plan, decisions]
---

# Decisions

## Chosen by the owner, 6 November 2026

1. **What it is.** ✅ The business side of being an author: catalog, editions, ISBNs, prices, store links, accounts, release
   dates, launch plans, marketing and royalties, plus a royalty and pricing calculator.
2. **How sales come in.** ✅ By importing report files, so it needs no outside accounts.
3. **The first release.** ✅ The catalog and the money together in 1.0. *Catalog first* was recommended, because a smaller first
   release reaches him sooner. To keep the risk down, 1.0 reaches him as two test builds.
4. **Which stores.** ✅ KDP, Barnes & Noble Press, ACX, IngramSpark, Draft2Digital, Kobo, Apple Books, Lulu and Google Play
   Books, with a screen for matching columns for any other. The first four are in 1.0 and the rest in 1.1.
5. **Passwords.** ✅ A locked vault. *No passwords* was recommended, because it makes this app a password manager, which needs
   its own review. See [the design](design/vault-and-privacy.md).
6. **How far the money goes.** ✅ Costs, profit per book and series, direct sales, author copies, and a year-end summary. No tax
   advice.
7. **Marketing.** ✅ Plans and results. Posting stays with automation and RT Markdown Reader, and Substack and podcast operating
   notes stay out.
8. **Claude.** ✅ A connector before leaving Notion, off until you turn it on, with four levels. The vault is never reachable.
9. **What else moves.** ✅ The business checklist and personal finances. The job search stays out. *Formation only* was
   recommended, because personal money isn't an author's business. It's a separate section, off by default, with its own lock.
10. **Bank data.** ✅ Bank files, plus a feed from his own automation. The app never holds a bank login.

## Waiting for approval with this plan

These are recommendations the plan already follows. Approving the plan approves them, and any can be changed.

11. **Built the same way as RT Story Tracker.** Electron and an encrypted SQLite database, so the storage, lock, backups and
    release process are shared rather than rewritten.
12. **For any author.** His setup is a template, never built in.
13. **One library.** All your books, pen names and publisher names in one encrypted library, not one file per book, because
    the money and accounts cross every book.
14. **Numbered from 1.0.** The suite's pattern, from this app's own first version.
15. **The order of releases.** As in the [roadmap](../ROADMAP.md). Accounts and the vault come before costs and launches only
    because the catalog already points at accounts. Personal money comes after all the business work.
16. **The Desk, the store grid, and every row accounted for.** The three ideas that make this our own way of doing the job.
    See the [product plan](product-plan.md#how-it-does-the-job-its-own-way).
17. **Leaving Notion uses export files.** No token, in keeping with no outside accounts. RT Story Tracker's move takes the
    writing status from the same export.
18. **Two computers through a folder you already sync,** as in RT Markdown Reader. The vault and personal money stay on one
    computer unless you say otherwise.
19. **Rates are dated data, never hidden in code,** so a change at a store is an update to a table you can see.
20. **The feed uses a folder, not a network port.** See [the design](design/vault-and-privacy.md#the-feed-folder). His n8n runs
    on another machine, so RT Markdown Reader's address on this computer would mean unencrypted bank data on the network.

## To check before or during the build

These are facts, not choices.

- **Real reports.** The KDP files on hand are from December 2024, and the other stores' layouts haven't been seen. Step zero
  collects a recent one from each store. For a store with no direct account yet, such as Kobo or Google Play Books Partner
  Center, the reader waits for a real file, and Match your columns covers it until then.
- **ACX rates.** Secondary sources say a new royalty model became the default on 26 May 2026, at 50% exclusive and 30%
  non-exclusive, with the old 40% and 25% ending at the end of 2026. Check this against ACX and the contract for each title.
- **KDP's ebook band.** The owner's own guide says the 70% rate reaches $12.99 since 7 July 2026, citing KDP's pricing page, and
  some outside sources still say $9.99. KDP's page decides.
- **How KENP royalties appear.** The sample report has pages read but no rows that show a KENP royalty. A report from a month
  with Kindle Unlimited reads will settle it.
- **The suite page.** It needs a line for personal money, and for the vault.
