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
};

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
];

module.exports = { STEPS, TABLES };
