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
   **Changed on 18 November 2026, by the owner, after trying the first test build.** 1.0 is the catalog alone, and the money is
   1.1. The app leaves alpha when the catalog is solid, and doesn't wait for the money, so the original recommendation
   (*catalog first*) is what was done. Every later release moved up by one: Every store is 1.2, and Two computers is 1.10.
4. **Which stores.** ✅ KDP, Barnes & Noble Press, ACX, Google Play Books, IngramSpark, Draft2Digital, Kobo, Apple Books and Lulu,
   with a screen for matching columns for any other. The first five are in 1.1 and the rest in 1.2. Google Play Books moved up
   on 6 November: he self-publishes there, so it's one of his main platforms, and it stays in the first batch of readers.
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
11. **Audiobook tracking.** ✅ Per title and store: which recording is live, whether its voice is human or synthesized, what rights
    it has, and which are waiting to be replaced. Google's auto-made audiobooks use a generic voice, and he plans to replace them
    with versions made in RT Audio Studio. This app tracks that, and RT Audio Studio makes the audio.

## Waiting for approval with this plan

These are recommendations the plan already follows. Approving the plan approves them, and any can be changed.

12. **Built the same way as RT Story Tracker.** Electron and an encrypted SQLite database, so the storage, lock, backups and
    release process are shared rather than rewritten.
13. **For any author.** His setup is a template, never built in.
14. **One library.** All your books, pen names and publisher names in one encrypted library, not one file per book, because
    the money and accounts cross every book.
15. **Numbered from 1.0.** The suite's pattern, from this app's own first version.
16. **The order of releases.** As in the [roadmap](../ROADMAP.md). Accounts and the vault come before costs and launches only
    because the catalog already points at accounts. Personal money comes after all the business work.
17. **The Desk, the store grid, and every row accounted for.** The three ideas that make this our own way of doing the job.
    See the [product plan](product-plan.md#how-it-does-the-job-its-own-way).
18. **Leaving Notion uses export files.** No token, in keeping with no outside accounts. RT Story Tracker's move takes the
    writing status from the same export.
19. **Two computers through a folder you already sync,** as in RT Markdown Reader. The vault and personal money stay on one
    computer unless you say otherwise.
20. **Rates are dated data, never hidden in code,** so a change at a store is an update to a table you can see.
21. **The feed uses a folder, not a network port.** See [the design](design/vault-and-privacy.md#the-feed-folder). His n8n runs
    on another machine, so RT Markdown Reader's address on this computer would mean unencrypted bank data on the network.

## Small choices made while building

These follow the plan and fill gaps in it. Any can be changed.

22. **Each ISBN is in the register once.** An edition can hold several (a store's free one and one you own), but a number can't
    be on two editions, so "an ISBN is on two editions" can't happen: adding it again says where it already is. A number that
    fails its check digit is refused when you type it, and flagged if it arrives from elsewhere, such as the move from Notion.
23. **The nine stores come built in, with fixed IDs,** so two computers that each start a library agree on them. They can be
    switched off but not removed. Your own stores are ordinary records beside them.
24. **A price belongs to a marketplace and a date.** A new date adds to the history, and the same date corrects that day.
25. **An exclusive program or recording deal names its store,** because the clash checks can't judge "elsewhere" without it.
26. **A store listing's route is recorded,** and the same edition can be on one store both directly and through a distributor.
27. **Dismissing a clash needs a reason,** and it stays dismissed until the records it names change.
28. **Ten of the fifteen clash checks are built.** The rest wait for the data they need: rate cards, spacing rules and pre-order
    deadlines. (Nine were built at first. The tenth, a credit shown differently on two stores, came with contributors.)
29. **Rows nobody owns yet are kept and counted.** A report row that matches no edition is saved with no edition, so the library's
    totals still agree with the report. The Money screen asks about each ASIN or ISBN once and remembers the answer.
30. **A report that doesn't match its own total can still be imported, but only on purpose.** The mismatch is shown first, the
    person ticks that they know, and the batch carries a red flag on the Money screen until it is undone. It is never dropped silently.
31. **The original file is kept inside the encrypted library**, not beside it, so it is as encrypted as everything else and goes
    with a backup. Undoing a batch removes it. The batch stays in the list as "undone".
32. **A payment counts as paid only when its status says Paid.** Anything else is shown as waiting, with the status as written. No
    real payments report has been seen, so this needs checking against one.
33. **A month is the unit for sales.** KDP's royalty date is a month, so earned-by-month is exact, and a payment is placed in the month
    its sales period starts.
34. **Corrected rows aren't replaced yet.** A row the store has changed counts as a new row, not a correction. "Replaced, with your
    agreement" in the design isn't built.
35. **A store's credits are only checked once they've been written down.** A listing says which of its edition's credits the store
    shows, and whether that has been written down at all. A store nobody has looked at isn't taken to show nothing, so the check never
    fires for a store the owner hasn't described. Nothing is ticked for you when you write one down, because the point is to find
    what is missing. This was chosen when contributors were built, ahead of 1.0.0 at the owner's request.
36. **A person is in the list once, by name,** and a person who is still credited can't be removed. Credits are one person in one role
    on one edition, from a fixed list of roles (and "other", with a note), so a role needs no new code.
37. **The menus are the list of commands.** Go to (`Ctrl+K`, then `>`) runs any command in the menus by name, taken from the menus
    themselves, so a command is written once and the menus can stay short, as RT Markdown Reader's are. The window can only ask for a
    command by its id, and only a command with an action of its own can be run.
38. **Your own colours are worked out, not trusted.** Customize Theme keeps three colours as checked `#rrggbb` values, and the words on
    them are changed only as much as it takes to be read (the maths is Reader's, copied). The window can only set a few named variables,
    and a test measures the result over hundreds of colours in every theme. High Contrast ignores them, and Glass stays solid while a
    panel or background colour is in use.
39. **Accessibility is checked by programs, not by eye.** Names for a screen reader, the keyboard order, the focus ring, the border of a
    field, Windows high contrast and colour blindness are tested on the real page, and each check was shown to fail when what it guards
    is taken away. A new button without a name fails a test instead of reaching someone who cannot see the problem.

## To check before or during the build

These are facts, not choices.

- **Real reports.** The KDP files on hand are from December 2024, and the other stores' layouts haven't been seen. Step zero
  collects a recent one from each store. For a store with no direct account yet, such as Kobo, the
  reader waits for a real file, and Match your columns covers it until then.
- **ACX rates.** Secondary sources say a new royalty model became the default on 26 May 2026, at 50% exclusive and 30%
  non-exclusive, with the old 40% and 25% ending at the end of 2026. Check this against ACX and the contract for each title.
- **KDP's ebook band.** The owner's own guide says the 70% rate reaches $12.99 since 7 July 2026, citing KDP's pricing page, and
  some outside sources still say $9.99. KDP's page decides.
- **The sample KDP report doesn't add up.** In the December 2024 orders file, the Summary says 50.38 USD, 0.52 GBP, 0.03 EUR and 0.06 CAD,
  but the detail sheets hold 49.53 USD and nothing in the other currencies. The cause isn't known: a filtered export, royalties that
  only the Summary counts (such as pages read), or a layout we haven't understood. The reader reports the difference and doesn't hide it.
  A recent report from the owner will settle it, and until then totals are labeled estimates.
- **How KENP royalties appear.** The sample report has pages read but no rows that show a KENP royalty. A report from a month
  with Kindle Unlimited reads will settle it.
- **Google Play Books.** Notion says he publishes audiobooks and physical books there. Print sales on Google weren't confirmed for
  this plan, so a real report will show what it covers. A listing can record either route.
- **Replacing a Google audiobook.** Google's help doesn't spell out swapping an auto-narrated book for your own recording, so try it
  on one book first. Its accepted audio formats and limits go on a rate card, once they're confirmed in Partner Center.
- **Each recording's rights.** Every title's ACX contract has to be read before a recording goes anywhere else.
- **The suite page.** It needs a line for personal money, and for the vault.
