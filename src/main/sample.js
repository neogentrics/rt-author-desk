'use strict';
// A made-up catalog for looking around: a short series, a standalone book and a few problems to find. It's filled into a
// separate library that is thrown away afterwards, so nothing in it can touch the real one. Every name is invented, and the
// dates are counted from today so the Desk always has something coming up.
const { Catalog } = require('./catalog');

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

function fillSample(library, today) {
  const c = new Catalog(library);
  const pen = c.savePenName({ name: 'A. Writer' });
  const press = c.savePublisherName({ name: 'Harbour Lane Press', from_date: addDays(today, -700) });
  const series = c.saveSeries({ name: 'The Tidewater Books', pen_name_id: pen.id });

  const one = c.saveBook({ title: 'Tidewater', subtitle: 'A made-up first book', series_id: series.id, series_number: '1', pen_name_id: pen.id, business_status: 'live' });
  const two = c.saveBook({ title: 'Low Water', series_id: series.id, series_number: '2', pen_name_id: pen.id, business_status: 'in progress' });
  c.saveBook({ title: 'A Quiet Harbour', business_status: 'planned', notes: 'A standalone, not started.' });

  // Book one: on sale, with some things wrong on purpose.
  const ebook = c.saveEdition({ book_id: one.id, format: 'ebook', release_date: addDays(today, -300), cover_status: 'final', files_status: 'final', publisher_name_id: press.id });
  const paperback = c.saveEdition({ book_id: one.id, format: 'paperback', release_date: addDays(today, -300), page_count: 312, trim_size: '5.5 x 8.5 in', cover_status: 'final', files_status: 'final' });
  const audio = c.saveEdition({ book_id: one.id, format: 'audiobook', release_date: addDays(today, -180), length_minutes: 600 });

  const kdp = c.saveListing({ edition_id: ebook.id, store_id: 'store-kdp', status: 'live', store_item_id: 'B0SAMPLE01', program: 'Kindle Select', program_exclusive: true, program_from: addDays(today, -90), program_until: addDays(today, 90), publisher_shown: 'Harbour Lane Press' });
  c.setPrice({ listingId: kdp.id, marketplace: 'US', currency: 'USD', amount: '4.99', fromDate: addDays(today, -300) });
  c.setPrice({ listingId: kdp.id, marketplace: 'UK', currency: 'GBP', amount: '3.99', fromDate: addDays(today, -300) });
  // The same ebook, on sale at Kobo while in an exclusive program, with a different publisher name: two clashes to find.
  c.saveListing({ edition_id: ebook.id, store_id: 'store-kobo', status: 'live', publisher_shown: 'Harbour Lane Publishing' });

  const free = c.addIsbn({ number: '9780306406157', issuer: 'store', storeId: 'store-kdp', editionId: paperback.id });
  const print = c.saveListing({ edition_id: paperback.id, store_id: 'store-kdp', status: 'live', isbn_id: free.id });
  c.setPrice({ listingId: print.id, marketplace: 'US', currency: 'USD', amount: '14.99', fromDate: addDays(today, -300) });
  // A store's free ISBN, used at another store.
  c.saveListing({ edition_id: paperback.id, store_id: 'store-ingramspark', status: 'live', isbn_id: free.id });
  c.addIsbn({ number: '9781861972712', issuer: 'bought', notes: 'Bought, not used yet.' });

  const narrated = c.saveRecording({ edition_id: audio.id, voice: 'human', read_by: 'Sam Reader', exclusive: true, exclusive_store_id: 'store-acx', exclusive_until: addDays(today, 900), royalty_share: true });
  const auto = c.saveRecording({ edition_id: audio.id, voice: 'synthesized', read_by: 'Auto-narrated', replacing: 'waiting' });
  const acx = c.saveListing({ edition_id: audio.id, store_id: 'store-acx', status: 'live', recording_id: narrated.id });
  c.setPrice({ listingId: acx.id, marketplace: 'US', currency: 'USD', amount: '19.95', fromDate: addDays(today, -180) });
  c.saveListing({ edition_id: audio.id, store_id: 'store-google-play-books', status: 'live', recording_id: auto.id });

  // Book two: coming soon, and not ready.
  c.saveEdition({ book_id: two.id, format: 'ebook', release_date: addDays(today, 21), cover_status: 'draft', files_status: 'draft' });
  c.saveEdition({ book_id: two.id, format: 'paperback', release_date: addDays(today, 28), cover_status: 'not started' });
  return { books: 3 };
}

module.exports = { addDays, fillSample };
