'use strict';
// Writes a small .xlsx from rows of text, for tests. Made-up reports with the stores' real layouts live in the repo;
// real reports never do (test/private/ is ignored).
const { strToU8, zipSync } = require('fflate');

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// sheets: [{ name, rows: [[cell, ...], ...] }]. A number is written as a number cell; anything else as a shared string.
function makeXlsx(sheets) {
  const strings = [];
  const index = new Map();
  const shared = (text) => {
    if (!index.has(text)) {
      index.set(text, strings.length);
      strings.push(text);
    }
    return index.get(text);
  };
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  };
  sheets.forEach((sheet, i) => {
    const rows = sheet.rows.map((cells, r) => {
      const out = cells.map((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return '';
        const ref = `${columnName(c)}${r + 1}`;
        return typeof cell === 'number' ? `<c r="${ref}"><v>${cell}</v></c>` : `<c r="${ref}" t="s"><v>${shared(String(cell))}</v></c>`;
      }).join('');
      return `<row r="${r + 1}">${out}</row>`;
    }).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
    sheets.map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
    strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));
}

const SALE = ['Royalty Date', 'Title', 'Author Name', 'ASIN/ISBN', 'Marketplace', 'Royalty Type', 'Transaction Type',
  'Units Sold', 'Units Refunded', 'Net Units Sold', 'Avg. List Price without tax', 'Avg. Offer Price without tax',
  'Avg. Delivery/Manufacturing cost', 'Royalty', 'Currency'];

// A made-up KDP orders workbook with the real layout: two books, two currencies.
function madeUpKdpOrders({ combinedHeader = SALE, summaryUsd = '7.06', extraEbookRow = false, printIsbn = '9780000000002', extraSale = false, refund = false } = {}) {
  const ebook = ['2026-09', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', '70%', 'Standard', 3, 0, 3, 4.99, 4.99, 0.06, 2.0699999999999998, 'USD'];
  const free = ['2026-09', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', 'N/A', 'Free - Promotion', 5, 0, 5, 4.99, 0, 0, 0, 'USD'];
  const print = ['2026-09', 'The Lantern Road', 'A. Writer', printIsbn, 'Amazon.com', '60%', 'Standard - Paperback', 1, 0, 1, 12.99, 12.99, 2.8, 4.99, 'USD'];
  const uk = ['2026-09', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.co.uk', '70%', 'Standard', 1, 0, 1, 3.99, 3.99, 0.05, 2.74, 'GBP'];
  // An extra sale in the next month, so a second file can overlap the first. A refund is a negative royalty.
  const later = ['2026-10', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', '70%', 'Standard', 2, 0, 2, 4.99, 4.99, 0.04, 1.38, 'USD'];
  const returned = ['2026-10', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', '70%', 'Refund', 0, 1, -1, 4.99, 4.99, 0.02, -0.69, 'USD'];
  const extra = [...(extraSale ? [later] : []), ...(refund ? [returned] : [])];
  const fmt = (row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], row[13], row[14]];
  return makeXlsx([
    { name: 'Report Definitions', rows: [['Report', 'Definition'], ['Summary', 'Totals.']] },
    { name: 'Summary', rows: [['Date', 'Paid Units Sold (eBook)', 'Royalty (USD)', 'Royalty (GBP)'], ['2026-09-01', 4, summaryUsd, 2.74]] },
    { name: 'Combined Sales', rows: [combinedHeader, ebook, free, print, uk, ...extra] },
    { name: 'eBook Royalty', rows: [['Royalty Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Royalty Type', 'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold', 'Avg. List Price without tax', 'Avg. Offer Price without tax', 'Avg. File Size (MB)', 'Avg. Delivery Cost', 'Royalty', 'Currency'],
      fmt(ebook), fmt(free), fmt(uk), ...extra.map(fmt), ...(extraEbookRow ? [fmt(ebook)] : [])] },
    { name: 'Paperback Royalty', rows: [['Royalty Date', 'Order Date', 'Title', 'Author Name', 'ISBN', 'Marketplace', 'Royalty Type', 'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold', 'Avg. List Price without tax', 'Avg. Offer Price without tax', 'Avg. Manufacturing Cost', 'Royalty', 'Currency', 'ASIN'],
      ['2026-09', '2026-09-03', 'The Lantern Road', 'A. Writer', '9780000000002', 'Amazon.com', '60%', 'Standard - Paperback', 1, 0, 1, 12.99, 12.99, 2.8, 4.99, 'USD', 'B0TESTPBK1']] },
    { name: 'Hardcover Royalty', rows: [['Royalty Date', 'Order Date', 'Title', 'Author Name', 'ISBN', 'Marketplace', 'Royalty Type', 'Transaction Type', 'Units Sold', 'Units Refunded', 'Net Units Sold', 'Avg. List Price without tax', 'Avg. Offer Price without tax', 'Avg. Manufacturing Cost', 'Royalty', 'Currency', 'ASIN']] },
    { name: 'Orders Processed', rows: [['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Paid Units', 'Free Units'], ['2026-09-02', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', 3, 5]] },
    { name: 'eBook Orders Placed', rows: [['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Paid Units', 'Free Units']] },
    { name: 'KENP Read', rows: [['Date', 'Title', 'Author Name', 'ASIN', 'Marketplace', 'Kindle Edition Normalized Page (KENP) Read'], ['2026-09-04', 'The Lantern Road', 'A. Writer', 'B0TESTEBK1', 'Amazon.com', 120]] },
  ]);
}

function madeUpKdpPayments() {
  return makeXlsx([{ name: 'Payments', rows: [
    ['Sales Period - Start Date', 'Sales Period - End Date', 'Marketplace', 'Payment Number', 'Detail', 'Date', 'Payment Method', 'Currency', 'Accrued Royalty', 'Tax Withholding', 'Adjustments', 'Net Earnings', 'Source', 'FX Rate', 'Currency', 'Payout Amount', 'Payment Status'],
    ['2026-09-01', '2026-09-30', 'Amazon.co.uk', '123', 'Royalty', '2026-11-29', 'EFT', 'GBP', 2.74, 0, 0, 2.74, 'KDP', '1.2645', 'USD', 3.46, 'Paid'],
  ] }]);
}

module.exports = { SALE, madeUpKdpOrders, madeUpKdpPayments, makeXlsx };
