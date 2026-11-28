'use strict';
// A made-up Barnes & Noble Press sales report, laid out from the 17 column names its help page lists (docs/design/store-report-layouts.md). No
// real report was used, and every name, title and number here is invented. The layout is what the page says, not what B&N has been seen to send.
const { makeXlsx } = require('./make-xlsx.cjs');

const HEADINGS = [
  'Sale Date', 'Title', 'Format', 'BN ID / ISBN', 'eBook ISBN', 'Author', 'Publisher', 'Selling Currency', 'List Price', 'Payment Currency',
  'Unit Royalty', 'Units Sold', 'Units Returned', 'Net Units Sold', 'Print Cost', 'Total Royalty', 'Royalty %',
];

// One row, by heading: three ebooks at 4.99 earning 3.25 each. Numbers are numbers, so they are written as a workbook stores them.
const row = (changes = {}) => ({
  'Sale Date': '2026-09-14', Title: 'The Lantern Road', Format: 'eBook', 'BN ID / ISBN': '2940000000001', 'eBook ISBN': '', Author: 'Made-up Author',
  Publisher: 'Made-up Press', 'Selling Currency': 'USD', 'List Price': 4.99, 'Payment Currency': 'USD', 'Unit Royalty': 3.25, 'Units Sold': 3,
  'Units Returned': 0, 'Net Units Sold': 3, 'Print Cost': '', 'Total Royalty': 9.75, 'Royalty %': '65%', ...changes,
});

const table = (lines, { headings = HEADINGS, rename = {} } = {}) => [headings.map((name) => rename[name] ?? name), ...lines.map((values) => headings.map((name) => values[name] ?? ''))];

// The workbook. `above` is rows over the headings, `sheets` more sheets, `headings` another order or some left out, `rename` old to new.
function makeBn(lines = [row()], { above = [], sheets = [], name = 'Sales', ...options } = {}) {
  return makeXlsx([{ name, rows: [...above, ...table(lines, options)] }, ...sheets]);
}

module.exports = { HEADINGS, makeBn, row, table };
