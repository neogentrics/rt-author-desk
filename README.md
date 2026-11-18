# RT Author Desk

The business side of being an author, on your own computer: your books, editions, ISBNs, prices, store listings,
accounts, launches, marketing, royalties and costs, in one place. For Windows, Mac and Linux, with no account, no ads and
nothing else to install.

RT Author Desk is part of the **Recon Towers** suite, built by its Dev Department. It was inspired by the owner writing his
own books.

> **Status: early build. There's nothing to download yet.**
> The catalog is working in test builds, and the money (sales reports, royalties) is next. Start with the [roadmap](ROADMAP.md).

## What it will do

- **Keep the catalog.** Every book, every edition, every ISBN, and every store each edition is on, with its price and link.
- **Track every audiobook.** Which recording is live on which store, whether the voice is human or synthesized, what
  rights it has, and which recordings are waiting to be replaced.
- **Catch clashes.** An ebook in an exclusive program that's also on sale elsewhere, a free store ISBN used at another
  store, a publisher name that differs between stores, a price just under a royalty line.
- **Read your sales reports.** Download a report from a store and drop it in. The app accounts for every row, and importing
  a file twice does no harm. No store login is ever needed.
- **Show what you earned.** By month, book, edition, store and currency, with what's estimated kept apart from what was paid.
- **Work out prices.** A royalty and pricing calculator with dated rates you can check and change.
- **Show what a book really made.** Costs for covers, editing, narration and ads, set against what the book earned, plus
  sales at signings and other events, your stock of author copies, and a year-end summary for your taxes.
- **Run launches.** Plans with dated tasks worked back from the release date, listing text checked against each store's
  limits, campaigns, budgets and results.
- **Keep your accounts straight.** What each service is for, what it costs and when it renews, with an encrypted, locked
  vault for logins.
- **Work with the other Recon Towers apps.** Word counts come from RT Story Tracker, and published facts go back to it.

A private section for your personal budget, bills and debts is planned too. It's off until you turn it on, it has its own
lock, and it's kept apart from the business.

## What it won't do

- Sign in to a store, or scrape one. Your sales reach it as files you download.
- Post to social media or send email. Other tools do that, and RT Markdown Reader sends documents out.
- Give tax, legal or investment advice. It organizes your numbers.
- Replace bookkeeping software for a business with staff.
- Need AI. That's an add-on, off until you turn it on, with your choice of service, including a model on your own computer.

## What it runs on

The plan is the same base as RT Story Tracker: Electron, with an encrypted SQLite database inside the app, on Windows 10 or
later, macOS 13 or later, and 64-bit Linux. It works with no internet.

## The plan

| Page | What's in it |
|---|---|
| [Roadmap](ROADMAP.md) | Every release, what's in it and how it's tested |
| [Roadmap page](https://claude.ai/artifact/NUBwv6uERamH5akR2xLAZN) | The same roadmap as a page, private to the owner. Its source is `docs/roadmap.html` |
| [Product plan](docs/product-plan.md) | What the app is for, who it's for, and how it does the job its own way |
| [Decisions](docs/decisions.md) | What the owner has chosen, and what's waiting for his approval |
| [Data model](docs/design/data-model.md) | Books, editions, listings and money, and how they fit together |
| [Reading sales reports](docs/design/report-imports.md) | How each store's report comes in |
| [Royalties and prices](docs/design/royalties-and-prices.md) | How the calculator works, and where its rates come from |
| [The vault and your privacy](docs/design/vault-and-privacy.md) | What's encrypted, what's locked, and who can reach what |
| [Working with the suite](docs/design/working-with-the-suite.md) | What this app owns, and what it asks the other apps for |

## License

Proprietary. See [LICENSE](LICENSE).
