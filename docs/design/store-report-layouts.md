# Store report layouts: what each store says its report holds

Researched on 27 November 2026 from each store's own help pages (linked below). **None of these is a real file.** Where a store publishes its column list, it is copied here; where it doesn't, the row says so. A reader built from this list is built from the store's description, so it is tested on made-up files, and a real report from the owner is still what proves it.

**Rule for every reader below.** Find columns by their heading, never by position (IngramSpark's own help describes columns by letter, so its files must be read by heading and the letters used only as a check). A heading that isn't there stops the import and names the column, as the KDP reader does. Every amount is kept in the currency the report gives it, as a whole number of that currency's smallest unit.

| Store | Documented? | Where the owner gets it | File | Build order |
|---|---|---|---|---|
| Lulu | Every column | My Projects, Sales & Payments, pick the payee, **Generate and Download CSV of this list** | CSV | 1 |
| Barnes & Noble Press | Every column of the sales report | Sales, any date range, **Export Excel Sheet** | Excel | 2 |
| Google Play Books | Every column, both reports | Reports, Custom reports, **Export Report** | Tab-separated, `.csv` | 3 (the summary is already recognized) |
| Draft2Digital | The field names of the detail report, not their order | My Reports, eBook/Print/Audiobook Raw Sales Data, **See Details**, download | CSV, one month at a time | 4 |
| IngramSpark | Sales report columns by letter; paid compensation by name; no file sample | Reports, custom report; print compensation arrives as several emailed tab-delimited files | Excel / tab-delimited | 5 |
| Kobo Writing Life | **No.** Only the dashboard's CSV of book titles is mentioned | The monthly invoice, a zipped workbook with a Details sheet, from Payment Information | Excel | needs a real file |
| Apple Books | **No.** Rows are one per book, type, price, store, sale or return and promo | Payments and Financial Reports, Create Report | Tab-delimited `.txt`, gzip | needs a real file |
| ACX | **No.** The statement is an Excel workbook of several sheets | Insights, Earnings Statements, pick the month | Excel | needs a real file |
| Spotify for Authors (Findaway Voices) | **No.** Two kinds of royalty: à la carte and Premium | Reports, Royalty Reports | Unknown | needs a real file |

## Lulu (30 columns)

Reported Date (month/year), Sale Date, Type (Sale or Refund), Reference Number, Self-Purchase (y/n), Product ID, Version #, Title, Author, Format, Distribution Channel, Region, Sales Currency, Qty, List Price Each, Author Discounted Price Each, Retail Share, Base Price, Net Revenue, Lulu Share, Revenue After Fees, Withholding Tax Rate, Withholding Amount, Payee, Payee Percent, Payee Revenue, Royalties (y/n), Paid (y/n), Payee Revenue Currency, Converted Revenue, Promotional Price (y/n).

Things the reader must get right:
- **Per-unit and total amounts are mixed.** List Price Each, Author Discounted Price Each, Retail Share and Base Price are per one unit; Net Revenue, Lulu Share and Revenue After Fees are for the whole line. Don't multiply the wrong ones.
- A book with more than one payee appears once per payee. A total taken from every row double counts; the money to count is **Payee Revenue**, one row per payee, and the owner's own payee is the one to total.
- Two currencies: Sales Currency (the sale) and Payee Revenue Currency (payment). **Converted Revenue is an estimate until Paid is `y`**, then it is the real amount. This is the same earned-against-paid split KDP has.
- A refund is a row of Type Refund. Self-purchases are the owner's own buying and are flagged, not dropped.
- Retailer sales (Amazon, B&N, Apple through Lulu's distribution) arrive here a month at a time, 6 to 8 weeks late. The same sale will also be in that retailer's own report if the owner publishes there directly; matching by ISBN is how to avoid counting it twice.
- Lulu-owned ISBN earnings are royalties, other earnings are "Other Revenue" (the Royalties column). The Year-end summary needs the difference.

## Barnes & Noble Press (the sales report, 17 columns)

Sale Date, Title, Format (eBook, Print Hardcover, Print Paperback), BN ID / ISBN, eBook ISBN, Author, Publisher, Selling Currency, List Price, Payment Currency, Unit Royalty, Units Sold, Units Returned, Net Units Sold, Print Cost, Total Royalty, Royalty %.

- One row per book per day per list price: a price change gives two rows for one book.
- Selling currency and payment currency are separate columns. Unit Royalty is **in the payment currency**. Net Units Sold times Unit Royalty equals Total Royalty, which is a check the reader can run on every row.
- The page also lists a separate **Payments** report and a **Pre-Order** report. Their columns aren't published, so they wait for real files.
- Custom date reports cover at most 6 months. A print sale appears when it ships; an ebook when it is downloaded.

## Google Play Books

**Sales Summary** (net sales by book and country): Title, Author, Primary ISBN, Country of Sale, Units Purchased, Units Refunded, Net Units Sold, Total Publisher Earnings (in the customer's local currency).

**Sales Transaction** (one row per sale): Transaction Date, Id, Product (Single Purchase or Rental), Type (Sale, Refund or Promo code), Preorder (Authorized, Canceled, Fulfilled, None), Qty (negative for a refund), Primary ISBN (prefixed by a single quote), Imprint Name, Title, Author, List Price Currency, List Price, Country of Sale, Publisher Revenue %, Publisher Revenue (negative for a refund), Payment Currency, Payment Amount, Currency Conversion rate.

- The file is tab-separated with a `.csv` name. The sample already received is UTF-16 and has no date or currency in the summary, which is why the summary asks for the month and currency. The transaction report has both, so **ask the owner to export the transaction report as well**.
- The report only holds the columns that apply, so a missing optional column isn't an error; a missing required one is.
- Earnings reports (the paid money) come 5 business days after month end. Their columns aren't in the page.

## Draft2Digital (detail report)

Start Date, End Date, Title ID, Title, Primary Author, Sales Channel, Sales Model, Retailer, Publisher, Nation, Net Unit Sales, List Price, Royalty Rate, Unit Cost, Publisher Share USD, and a check box saying whether the line is **estimated or final**. The monthly download may hold both verified and unverified rows (a "Verified" column).

- Only **verified** rows are the money; the rest are estimates and must be kept apart, the same as KDP's earned against paid.
- Separate **royalty statements** exist, one per publisher paid, for the months D2D pays. Their columns aren't published.
- Smashwords was merged into Draft2Digital, so an older Smashwords history may arrive in this layout or in the earlier one.
- Download is one month at a time, so a year is twelve files; the app should say which months it has.

## IngramSpark

**Sales report.** Columns by letter: A ISBN, B Title, C Author, D Format (PF paperback, TC cloth), E BISAC Code, F BISAC Description, G Units Sold, H Country, I to N List Price (US, UK, Canada, Europe, Australia, UAE), O to T Wholesale Discount (same six), U to Z Returns (same six), AA to AJ Global Connect Price (India, Russia, Spain, South Korea, Germany, Brazil, Japan, Italy, China), AK to AT Global Connect Wholesale Discount, AU to AY Agency Price, AZ to BD Library Price.
- An ISBN starting `237` is an internal SKU, not a real ISBN, and the title can't be distributed. Don't match it to an edition; say so.
- This report has **units and prices, not money.** Money is in the compensation report.

**Paid compensation report:** Quantity (sold and returned), Net Sales (wholesale price of all sold), Print Charge (print books) or Distribution Charge (ebooks), Net Pub Comp (compensation after returns and deductions), and sometimes Tax and Other (the 1.875% global distribution fee and adjustments). The expanded title detail has more.
- Print compensation **can't be exported as one report**: it arrives as several emailed files, one for each operating unit and currency, so one month is several imports.
- Ebook compensation is 85% of the net revenue Ingram receives.
- Compensation closes at the end of the month and is paid later; sales appear within 24 to 48 hours but an order isn't final until shipped, and a seller can cancel before then. So **sales and compensation will not match**, and the app must say they are different things rather than call it a mismatch.
- The invoice list the owner supplied earlier is bills, not sales; neither report above is that.

## Not documented (needs a real file from the owner)

- **Kobo Writing Life.** The dashboard exports a CSV of book titles; the money is in the monthly invoice (a zipped workbook with a Details sheet). Kobo Plus (subscription reads) is a separate report counted in minutes. The live dashboard and the monthly report often differ, and a promotion can produce a credit that makes the payment lower than the sales. One third-party description lists units, list price, royalty, currency, marketplace and date per row, which is unverified.
- **Apple Books.** One row is one combination of book, transaction type, price, store, sale or return, and promo. The columns are in Apple's Payments and Financial Reports Guide, which wasn't reachable. One currency per report, a global report exists, and a month with no sales in a region has no file for it.
- **ACX.** An Excel workbook with several sheets; how to read it is in an ACX article that wasn't reachable.
- **Spotify for Authors (Findaway Voices).** Two royalty kinds (à la carte, Premium streams), paid monthly, with some months holding quarterly earnings, in US dollars.

## Other places a self-published author sells

The owner asked for the app to cover more than his own stores. Worth adding as readers or through Match your columns, each needing a real file first:
- **Amazon KDP** is built (orders and payments), with Kindle Unlimited page reads (KENP) still to confirm.
- **Draft2Digital** (also the home of Smashwords), **Kobo**, **Apple Books** and **IngramSpark** above.
- **Audiobooks:** ACX, Spotify for Authors and its Findaway Voices stores, and Kobo's audiobooks.
- **Aggregators:** PublishDrive and StreetLib, which pay for many stores in one report.
- **Libraries:** OverDrive and similar, reached through Kobo, Draft2Digital and Ingram, not usually reported on their own.
- **Direct sales** (Payhip, Gumroad, Shopify, a signing table) are in the Direct sales feature in v1.4, not in a store reader.
- **Match your columns** already covers any store that exports a table, with no new code.

## What the research changes in the plan

1. Lulu and B&N Press readers can be built now from documented headers, then confirmed against a real file.
2. The Google Play reader should take the transaction report too.
3. IngramSpark needs several files per month and keeps sales apart from compensation.
4. Kobo, Apple Books, ACX and Spotify can't be built honestly without a file. Until then Match your columns handles them.
5. Two things in the model to check before building: a **payee** (Lulu repeats a sale per payee) and a **verified or estimated** flag on every imported row (Lulu, D2D, KDP).

## Sources

IngramSpark: [Understanding the Information in the Sales Reports](https://help.ingramspark.com/hc/en-us/articles/5948747939341), [Reporting: Compensation Earnings](https://help.ingramspark.com/hc/en-us/articles/5281192809101-Reporting-Compensation-Earnings), [Understanding the Information in the Paid Compensation Earnings Report](https://help.ingramspark.com/hc/en-us/articles/5948649572109-Understanding-the-Information-in-the-Paid-Compensation-Earnings-Report).
B&N Press: [Sales Reports](https://help-press.barnesandnoble.com/hc/en-us/articles/5359639269403-Sales-Reports).
Lulu: [Creator Revenue Guide](https://help.lulu.com/en/support/solutions/articles/64000262744-creator-revenue-guide).
Google Play Books: [Google Play sales reports](https://support.google.com/books/partner/answer/3323314).
Draft2Digital: [A primer on sales reporting](https://www.draft2digital.com/blog/?p=209266). Kobo: [Understanding your new dashboard](https://kobowritinglife.zendesk.com/hc/en-us/articles/4412366365211-Understanding-Your-New-Dashboard), and PublishDrive's [import guide](https://help.publishdrive.com/import-your-kobo-writing-life-and-d2d-sales-reports-to-publishdrive-abacus).
Apple Books: [Payments and financial reports](https://itunespartner.apple.com/books/support/43-payments-financial-reports). Spotify: [Royalty reports](https://support.spotify.com/us/authors/article/royalty-reports/).
