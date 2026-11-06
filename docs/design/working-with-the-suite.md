---
title: "Design: working with the suite"
subtitle: What this app owns, and what it asks the others for
author: Recon Towers Dev Department
date: 2026-11-06
tags: [design, suite]
---

# Working with the suite

Built to [the suite's rules](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-suite.md) and
[App Link](https://github.com/neogentrics/rt-markdown-reader/blob/main/docs/app-link.md). One thing has one home, and the others
ask for it. App Link id: `rt-author-desk`. This app works completely on its own, and every link below only adds to it.

## What this app owns

| Thing | Who else uses it |
|---|---|
| Published editions, ISBNs, prices, store links, release dates | RT Story Tracker's catalog shows them |
| Royalties, costs, accounts, launch plans, marketing | Nobody. They stay here |

## What it asks others for

| Thing | Home | Used for |
|---|---|---|
| Word counts, draft status, what's left | RT Story Tracker | Shown on the book and the Desk, and for launch plans |
| The list of books | RT Story Tracker | Linking a book here to the same book there |
| Print files and covers made | RT Press | Recorded on the edition: page count, trim size, finished date |
| Audio masters made | RT Audio Studio | A new recording on the edition: length, narrator, voice type, finished date |
| Sending a document out | RT Markdown Reader | Launch posts and press kits, over `open_document` |

## The line with RT Story Tracker

Decided in RT Story Tracker's decision 18. Its v3.13 catalog keeps writing status and series, and shows published facts read from here.
Until this app exists, those are typed in there.

- **Book identity.** Each app keeps its own permanent IDs. A link stores the other app's ID, so either can run alone.
- **Series.** Both apps know the series. RT Story Tracker's name is shown when a book is linked, and a difference is pointed out rather than
  changed.
- **Status.** Writing status belongs to RT Story Tracker. The business status (planned, live, pulled, being reworked) belongs here. Notion's single
  Status column splits in two: *Outline* and *Drafting* are writing, and *Live* and *Pulled* are business.
- **Book details.** RT Story Tracker's book details form holds what a file needs for export, such as the ISBN on a copyright page. That reads from here
  once the apps are linked.
- **Leaving Notion.** Both apps read the same export of the Book Catalog, and each takes its own columns.

## The additions it needs

These are all in the suite page as planned, and RT Story Tracker's v3.8 builds the same list. Whichever app ships first writes the
exact shape into `app-link.md`, and the others follow it. All are additions to protocol version 1.

| Addition | Details |
|---|---|
| Installed list | `installed/rt-author-desk.json`. This app writes it from 1.0 |
| Apps panel | The same in every app |
| `status` | "3 launches planned" or "Importing a report". Never any figures, and nothing when locked |

### Proposed facts

Named for what they return. Each needs a key, and a locked project or vault answers `not_allowed`.

| Method | Answered by | Returns |
|---|---|---|
| `list_books` | RT Story Tracker | Permanent ID, title, series, number |
| `book_progress` | RT Story Tracker | Word count, chapters done, draft status |
| `published_facts` | This app | For a book: editions, formats, ISBNs, release dates, list prices and store links. **Never** royalties, costs or account details |
| `record_made` | This app, called by RT Press and RT Audio Studio | Says a file was finished, with its book, format, page count or length, and date. For audio, it also gives the voice type and who read it. It lands on a list for you to accept, because the rule is that a request never changes anything by itself |

## Replacing an audiobook

The two apps split this job. RT Audio Studio makes and checks the audio. This app tracks which recording is live on each store, what
rights it has and which are waiting to be replaced. When a new recording arrives through `record_made`, you choose what it
replaces. Uploading it to the store stays with you, and you mark it live here.

## Files that stay here

App Link carries no sales, royalties, costs or logins, even between linked apps. The suite promises that a link shares only what
an app owns for others to use, and the money isn't shared.

## What the other plans need to know

Left in the shared notes for the RT Press and RT Audio Studio sessions: the shape of `record_made`, and that this app records what they made,
so they don't need their own edition, ISBN or price fields.
