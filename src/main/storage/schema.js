'use strict';
// Tables change in numbered steps, and a step that has shipped never changes. Add a new one instead.
// Storage rules from docs/design/data-model.md: every record has a permanent random ID, every change is logged, and a
// removal leaves a marker for 90 days, because sync can't be added to a database that didn't record these.
// Money is stored as a whole number of the smallest unit (TEXT, since it may not fit a float) beside its currency.

// The record tables and the columns a caller may set. Nothing outside this list ever reaches SQL as a name.
const TABLES = {
  publisher_names: ['name', 'from_date', 'to_date', 'notes'],
  pen_names: ['name', 'notes'],
  series: ['name', 'pen_name_id', 'notes'],
  books: ['title', 'subtitle', 'series_id', 'series_number', 'pen_name_id', 'business_status', 'story_link', 'notes'],
  stores: ['name', 'kind', 'active', 'notes'],
  editions: [
    'book_id', 'format', 'label', 'page_count', 'trim_size', 'paper', 'length_minutes', 'cover_status', 'files_status',
    'release_date', 'publisher_name_id', 'notes',
  ],
  isbns: ['isbn', 'issuer', 'store_id', 'edition_id', 'notes'],
  recordings: [
    'edition_id', 'voice', 'read_by', 'permission_note', 'rights_holder', 'exclusive', 'exclusive_store_id', 'exclusive_until',
    'royalty_share', 'contract_note', 'replacing', 'replaced_by_id', 'replaced_on', 'length_minutes', 'finished_on',
    'studio_project', 'notes',
  ],
  listings: [
    'edition_id', 'store_id', 'store_item_id', 'url', 'status', 'publisher_shown', 'route', 'via_store_id', 'program',
    'program_exclusive', 'program_from', 'program_until', 'isbn_id', 'recording_id', 'release_date', 'notes',
  ],
  prices: ['listing_id', 'marketplace', 'currency', 'amount', 'from_date', 'notes'],
};

// The stores every library starts with. Their IDs are fixed, so two computers that each made a new library agree on
// them. They are ordinary records: rename one, switch it off, or add your own store beside them.
const BUILT_IN_STORES = [
  ['store-kdp', 'Amazon KDP', 'store'],
  ['store-bn-press', 'Barnes & Noble Press', 'store'],
  ['store-acx', 'ACX', 'audio'],
  ['store-google-play-books', 'Google Play Books', 'store'],
  ['store-ingramspark', 'IngramSpark', 'distributor'],
  ['store-draft2digital', 'Draft2Digital', 'distributor'],
  ['store-kobo', 'Kobo', 'store'],
  ['store-apple-books', 'Apple Books', 'store'],
  ['store-lulu', 'Lulu', 'store'],
];
const BUILT_IN_AT = '2026-11-18T00:00:00.000Z';

const STEPS = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE changes (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          record_table TEXT NOT NULL,
          record_id TEXT NOT NULL,
          op TEXT NOT NULL CHECK (op IN ('put', 'remove')),
          fields TEXT NOT NULL,
          device_id TEXT NOT NULL,
          at TEXT NOT NULL
        );
        CREATE INDEX changes_by_record ON changes (record_table, record_id, seq);

        CREATE TABLE removals (
          record_table TEXT NOT NULL,
          record_id TEXT NOT NULL,
          removed_at TEXT NOT NULL,
          device_id TEXT NOT NULL,
          PRIMARY KEY (record_table, record_id)
        );

        CREATE TABLE publisher_names (
          id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', from_date TEXT, to_date TEXT, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE TABLE pen_names (
          id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE TABLE series (
          id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', pen_name_id TEXT, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE TABLE books (
          id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', series_id TEXT,
          series_number TEXT, pen_name_id TEXT,
          business_status TEXT NOT NULL DEFAULT 'planned'
            CHECK (business_status IN ('planned', 'in progress', 'live', 'pulled', 'being reworked')),
          story_link TEXT, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE INDEX books_by_series ON books (series_id, series_number);
      `);
    },
  },
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE stores (
          id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL DEFAULT 'store' CHECK (kind IN ('store', 'distributor', 'audio')),
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE TABLE editions (
          id TEXT PRIMARY KEY, book_id TEXT NOT NULL,
          format TEXT NOT NULL CHECK (format IN ('ebook', 'paperback', 'hardcover', 'large print', 'audiobook')),
          label TEXT NOT NULL DEFAULT '',
          page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
          trim_size TEXT NOT NULL DEFAULT '', paper TEXT NOT NULL DEFAULT '',
          length_minutes INTEGER CHECK (length_minutes IS NULL OR length_minutes > 0),
          cover_status TEXT NOT NULL DEFAULT 'not started' CHECK (cover_status IN ('not started', 'draft', 'final')),
          files_status TEXT NOT NULL DEFAULT 'not started' CHECK (files_status IN ('not started', 'draft', 'final')),
          release_date TEXT CHECK (release_date IS NULL OR release_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          publisher_name_id TEXT, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE INDEX editions_by_book ON editions (book_id, format);
        CREATE TABLE isbns (
          id TEXT PRIMARY KEY,
          isbn TEXT NOT NULL CHECK (length(isbn) > 0),
          issuer TEXT NOT NULL DEFAULT 'bought' CHECK (issuer IN ('bought', 'store', 'given')),
          store_id TEXT, edition_id TEXT, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE UNIQUE INDEX isbns_one_each ON isbns (isbn);
        CREATE INDEX isbns_by_edition ON isbns (edition_id);
      `);
      const add = db.prepare(
        "INSERT INTO stores (id, name, kind, created_at, updated_at, device_id) VALUES (?, ?, ?, ?, ?, 'built-in')",
      );
      for (const [id, name, kind] of BUILT_IN_STORES) add.run(id, name, kind, BUILT_IN_AT, BUILT_IN_AT);
    },
  },
  {
    version: 3,
    up(db) {
      const date = (column) => `${column} TEXT CHECK (${column} IS NULL OR ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`;
      db.exec(`
        CREATE TABLE recordings (
          id TEXT PRIMARY KEY, edition_id TEXT NOT NULL,
          voice TEXT NOT NULL DEFAULT 'human' CHECK (voice IN ('human', 'synthesized', 'cloned')),
          read_by TEXT NOT NULL DEFAULT '', permission_note TEXT NOT NULL DEFAULT '', rights_holder TEXT NOT NULL DEFAULT '',
          exclusive INTEGER NOT NULL DEFAULT 0 CHECK (exclusive IN (0, 1)),
          exclusive_store_id TEXT, ${date('exclusive_until')},
          royalty_share INTEGER NOT NULL DEFAULT 0 CHECK (royalty_share IN (0, 1)),
          contract_note TEXT NOT NULL DEFAULT '',
          replacing TEXT NOT NULL DEFAULT 'keep' CHECK (replacing IN ('keep', 'waiting')),
          replaced_by_id TEXT, ${date('replaced_on')},
          length_minutes INTEGER CHECK (length_minutes IS NULL OR length_minutes > 0),
          ${date('finished_on')}, studio_project TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE INDEX recordings_by_edition ON recordings (edition_id);

        CREATE TABLE listings (
          id TEXT PRIMARY KEY, edition_id TEXT NOT NULL, store_id TEXT NOT NULL,
          store_item_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'pre-order', 'live', 'pulled')),
          publisher_shown TEXT NOT NULL DEFAULT '',
          route TEXT NOT NULL DEFAULT 'direct' CHECK (route IN ('direct', 'distributor')),
          via_store_id TEXT, program TEXT NOT NULL DEFAULT '',
          program_exclusive INTEGER NOT NULL DEFAULT 0 CHECK (program_exclusive IN (0, 1)),
          ${date('program_from')}, ${date('program_until')},
          isbn_id TEXT, recording_id TEXT, ${date('release_date')}, notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE UNIQUE INDEX listings_one_each ON listings (edition_id, store_id, route);
        CREATE INDEX listings_by_store ON listings (store_id);

        CREATE TABLE prices (
          id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, marketplace TEXT NOT NULL CHECK (length(marketplace) > 0),
          currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
          amount TEXT NOT NULL CHECK (amount GLOB '[0-9]*' AND amount NOT GLOB '*[^0-9]*'),
          from_date TEXT NOT NULL CHECK (from_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, device_id TEXT NOT NULL
        );
        CREATE UNIQUE INDEX prices_one_per_day ON prices (listing_id, marketplace, from_date);
      `);
    },
  },
];

module.exports = { BUILT_IN_STORES, STEPS, TABLES };
