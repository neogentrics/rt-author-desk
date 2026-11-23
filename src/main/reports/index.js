'use strict';
// Which stores' reports the app can read. A store with no real sample file yet is an empty slot: it is listed, says it is
// waiting, and reads nothing, because a layout guessed from a help page would put wrong money in the library.
const { readKdp } = require('./kdp');

const WAITING = 'Waiting for a real report from this store to build the reader from. Until then, Match your columns reads its report.';

const READERS = [
  { id: 'kdp', storeId: 'store-kdp', name: 'Amazon KDP', ready: true, reads: 'Orders and payments reports (.xlsx)', read: readKdp },
  { id: 'bn-press', storeId: 'store-bn-press', name: 'Barnes & Noble Press', ready: false, waiting: WAITING },
  { id: 'acx', storeId: 'store-acx', name: 'ACX', ready: false, waiting: WAITING },
  { id: 'google-play-books', storeId: 'store-google-play-books', name: 'Google Play Books', ready: false, waiting: WAITING },
  { id: 'ingramspark', storeId: 'store-ingramspark', name: 'IngramSpark', ready: false, waiting: WAITING },
  { id: 'draft2digital', storeId: 'store-draft2digital', name: 'Draft2Digital', ready: false, waiting: WAITING },
  { id: 'kobo', storeId: 'store-kobo', name: 'Kobo', ready: false, waiting: WAITING },
  { id: 'apple-books', storeId: 'store-apple-books', name: 'Apple Books', ready: false, waiting: WAITING },
  { id: 'lulu', storeId: 'store-lulu', name: 'Lulu', ready: false, waiting: WAITING },
];

// The first ready reader that recognizes the workbook, or null.
function readReport(workbook) {
  for (const reader of READERS.filter((r) => r.ready)) {
    const report = reader.read(workbook);
    if (report) return { ...report, reader: { id: reader.id, storeId: reader.storeId, name: reader.name } };
  }
  return null;
}

const readerStatus = () => READERS.map(({ id, storeId, name, ready, reads, waiting }) => ({ id, storeId, name, ready, reads: reads ?? null, waiting: waiting ?? null }));

module.exports = { READERS, readReport, readerStatus };
