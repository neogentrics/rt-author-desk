'use strict';
// A made-up Lulu sales report, laid out from the 30 column names Lulu's help page gives. No real report was used, and every name, title and
// number here is invented. The layout is therefore what Lulu says, not what Lulu has been seen to send.
const { stringifyCsv } = require('../../src/shared/csv');

const HEADINGS = [
  'Reported Date', 'Sale Date', 'Type', 'Reference Number', 'Self-Purchase (y/n)', 'Product ID', 'Version #', 'Title', 'Author', 'Format',
  'Distribution Channel', 'Region', 'Sales Currency', 'Qty', 'List Price Each', 'Author Discounted Price Each', 'Retail Share', 'Base Price',
  'Net Revenue', 'Lulu Share', 'Revenue After Fees', 'Withholding Tax Rate', 'Withholding Amount', 'Payee', 'Payee Percent', 'Payee Revenue',
  'Royalties (y/n)', 'Paid (y/n)', 'Payee Revenue Currency', 'Converted Revenue', 'Promotional Price (y/n)',
];

const ME = 'Made-up Author';
const THEM = 'Made-up Illustrator';

// One line, by heading. Two copies at 15.00 each, earning 6.00 between them.
const line = (changes = {}) => ({
  'Reported Date': '09/2026', 'Sale Date': '2026-09-14', Type: 'Sale', 'Reference Number': 'R-100001', 'Self-Purchase (y/n)': 'n', 'Product ID': 'pid-aaaa11',
  'Version #': '1', Title: 'The Lantern Road', Author: ME, Format: 'Paperback', 'Distribution Channel': 'Lulu Bookstore', Region: 'US', 'Sales Currency': 'USD',
  Qty: '2', 'List Price Each': '15.00', 'Author Discounted Price Each': '15.00', 'Retail Share': '0.00', 'Base Price': '8.00', 'Net Revenue': '14.00',
  'Lulu Share': '8.00', 'Revenue After Fees': '6.00', 'Withholding Tax Rate': '0', 'Withholding Amount': '0.00', Payee: ME, 'Payee Percent': '100', 'Payee Revenue': '6.00',
  'Royalties (y/n)': 'y', 'Paid (y/n)': 'n', 'Payee Revenue Currency': 'USD', 'Converted Revenue': '6.00', 'Promotional Price (y/n)': 'n', ...changes,
});

// The file as Lulu would send it. `headings` can be given in another order, with some left out or renamed (`rename` is old name to new).
function makeLulu(lines = [line()], { headings = HEADINGS, rename = {} } = {}) {
  const rows = [headings.map((name) => rename[name] ?? name), ...lines.map((values) => headings.map((name) => values[name] ?? ''))];
  return Buffer.from(stringifyCsv(rows, { safe: false }), 'utf8');
}

module.exports = { HEADINGS, ME, THEM, line, makeLulu };
