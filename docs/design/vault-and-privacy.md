---
title: "Design: the vault and your privacy"
subtitle: What's encrypted, what's locked, and who can reach what
author: Recon Towers Dev Department
date: 2026-11-06
tags: [design, security]
---

# The vault and your privacy

This app holds what an author keeps most private: earnings, logins and, if you turn it on, personal money. There are three levels of
protection, and each one sits inside the last.

| Level | What's in it | How it's protected |
|---|---|---|
| **The library** | Catalog, reports, costs, launches, accounts | An encrypted database, with its key kept by the computer's login. A copied file is a garbled mess. A password on the whole app is optional |
| **Personal money** | Bank data, budget, bills and debts | Its own key. Off until you turn it on |
| **The vault** | Logins | Its own password, always. It locks by itself |

## Who can reach what

| | Library | Personal money | Vault |
|---|---|---|---|
| You, with the app open | ✅ | After unlocking | After unlocking |
| Linked apps, through App Link | Published facts only | Never | Never |
| Claude and other AI | At the level you set | Its own switch, off by default | Never, at any level |
| Automations | What you choose to send | The feed folder coming in, nothing going out | Never |
| Backups | ✅ Encrypted | ✅ Still under its own key | ✅ Still under its own key |
| Plain exports | ✅ | Only with its own unlock | Only by a deliberate export, with a warning |
| Logs and crash reports | Never any private data | Never | Never |

## The vault

The owner chose a locked vault over leaving passwords in a password manager. That makes this part of the app a password manager, so it's
held to that standard, and it's the one part that needs a review before it ships.

**How it works.** It uses RT Story Tracker's [lock design](https://github.com/neogentrics/rt-story-tracker/blob/master/docs/design/passwords-and-recovery.md):

- A random vault key encrypts every item, and key slots hold it for each way in.
- The password is stretched with scrypt or Argon2id and never stored. It's a separate password from the app's.
- A recovery key is shown once, to save or print.
- A trusted computer and an authenticator are optional, as in RT Story Tracker. An authenticator code alone can never open the vault.

**What it holds.** Per account: username, password, recovery codes, security answers and notes, encrypted field by field, with a password
generator.

**How it behaves.**

- It locks after a few idle minutes, on sleep, and when the computer locks.
- A copied password clears from the clipboard after 30 seconds, and it's marked so clipboard history leaves it out where the system allows.
- Passwords stay hidden until you ask, and the key is wiped from memory on lock, as far as Electron allows.
- It doesn't fill passwords into websites or browsers. It holds them, and you copy them.
- It holds no bank logins for the personal money section, because that section needs none.

**What it can't do.** No account means no spare key: if every way in is lost, nobody can open the vault. It can't protect logins from
malware running as you while it's open.

**Review.** An independent review comes before release, and the owner decides whether it's enough, as he did for RT Story Tracker's lock.

## Personal money

A separate section for your own budget, bills and debts. It's off by default, so an author who doesn't want it never sees it.

- **Apart.** It has its own key and tables. Business totals never include it, and the two can't be combined by accident.
- **No bank logins.** Data comes from files you import or the feed folder.
- **Facts, not advice.** It shows your own numbers and simple sums. It doesn't recommend what to do with debts or investments.
- **Transfers aren't spending.** Moving money between your own accounts, and paying a debt, are kept apart from spending. Counting them
  makes spending look far higher than it is.
- **Business money can cross once.** A royalty payment that lands in your bank can be marked as income in this section by hand. It's never
  linked automatically.

### The feed folder

The owner's bank data arrives each morning through his own automation, which runs on another machine. Letting that continue needs care,
because RT Markdown Reader's way, an address on this computer, would carry bank data across the network unencrypted.

The plan is a folder instead:

1. In the app, turn on the feed and choose a folder. The app makes a feed key and shows it once.
2. Your automation seals each batch with that key, using standard authenticated encryption, and leaves it in the folder as a file.
3. When the app opens, or while it's open, it takes in sealed files it can open and moves them to a done folder. A file that fails the check
   is left where it is and reported.

So the app opens no network port, nothing crosses the network in the clear, batches wait if the app is closed, and bank logins stay with
your automation. Batches go through the same duplicate checks as a bank file. The feed key is kept in the personal money section, and it can
be replaced at any time.

Your automation holds your bank connection, and that part sits outside this app. A guide will show how to seal a file in an n8n workflow.

## AI

Off until you turn it on. Before anything goes to an outside service, you see what would be sent. A local model keeps everything on your
computer. Keys are kept in the system's encrypted storage, as in RT Markdown Reader.

## Network

The app makes no connection unless you ask it to, except checking for updates, which you can turn off. There's no telemetry.
