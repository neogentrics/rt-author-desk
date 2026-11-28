'use strict';
// Which stores' reports the app can read. A store with no real sample file yet is an empty slot: it is listed, says it is
// waiting, and reads nothing, because a layout guessed from a help page would put wrong money in the library.
const { readKdp } = require('./kdp');
const { readLulu } = require('./lulu');

const WAITING = 'Waiting for a real report from this store to build the reader from. Until then, Match your columns reads its report.';

const READERS = [
  { id: 'kdp', storeId: 'store-kdp', name: 'Amazon KDP', ready: true, reads: 'Orders and payments reports (.xlsx)', formats: ['xlsx'], read: readKdp },
  { id: 'bn-press', storeId: 'store-bn-press', name: 'Barnes & Noble Press', ready: false, waiting: WAITING },
  { id: 'acx', storeId: 'store-acx', name: 'ACX', ready: false, waiting: WAITING },
  { id: 'google-play-books', storeId: 'store-google-play-books', name: 'Google Play Books', ready: false, waiting: 'Its Sales Summary report is recognized by Match your columns, which asks for the month and the currency, because that report holds neither. Waiting for a report with dates to build a full reader from.' },
  { id: 'ingramspark', storeId: 'store-ingramspark', name: 'IngramSpark', ready: false, waiting: 'Waiting for its report of sales. The invoices report is a list of bills, not sales, and is not read. Until then, Match your columns reads the sales report.' },
  { id: 'draft2digital', storeId: 'store-draft2digital', name: 'Draft2Digital', ready: false, waiting: WAITING },
  { id: 'kobo', storeId: 'store-kobo', name: 'Kobo', ready: false, waiting: WAITING },
  { id: 'apple-books', storeId: 'store-apple-books', name: 'Apple Books', ready: false, waiting: WAITING },
  { id: 'lulu', storeId: 'store-lulu', name: 'Lulu', ready: true, reads: 'Sales report (.csv). Built from Lulu\'s own description of it, and still to be confirmed on a real file', formats: ['csv', 'xlsx'], read: readLulu },
];

// The first ready reader that recognizes the file, or null. `format` is 'xlsx' or 'csv' (a CSV is one sheet). `context` holds the person's
// answers to a reader's questions, and what the library already knows that helps answer them.
function readReport(workbook, { format = 'xlsx', ...context } = {}) {
  for (const reader of READERS.filter((r) => r.ready && r.formats.includes(format))) {
    const report = reader.read(workbook, context);
    if (report) return { ...report, reader: { id: reader.id, storeId: reader.storeId, name: reader.name } };
  }
  return null;
}

const readerStatus = () => READERS.map(({ id, storeId, name, ready, reads, waiting }) => ({ id, storeId, name, ready, reads: reads ?? null, waiting: waiting ?? null }));

module.exports = { READERS, readReport, readerStatus };
