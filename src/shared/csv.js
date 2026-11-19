'use strict';
// Reading and writing CSV, the way spreadsheets and Notion do it: quoted cells, a doubled quote for a quote, new lines inside a
// quoted cell, and a comma, semicolon or tab between cells. Nothing here is specific to this app.

// A text file as text: UTF-8 (with or without a byte order mark), or Windows-1252 when it isn't valid UTF-8, which is how older
// spreadsheet programs save.
function decodeText(buffer) {
  let bytes = buffer;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

// Which character separates the cells: the one that appears most on the first line outside quotes. A tie is a comma.
function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) { if (Object.values(counts).some(Boolean)) break; }
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] === ',' ? -1 : b[0] === ',' ? 1 : 0))[0];
  return best[1] === 0 ? ',' : best[0];
}

class CsvError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CsvError';
  }
}

// Rows of cells. A row that is nothing but empty cells is dropped. A quote that never closes is an error, not a guess.
function parseCsv(text, { delimiter = detectDelimiter(text), maxRows = 100_000, maxCell = 100_000 } = {}) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    if (cell.length > maxCell) throw new CsvError('A cell in this file is far too long to be a spreadsheet cell.');
    row.push(cell);
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) {
      rows.push(row);
      if (rows.length > maxRows) throw new CsvError(`This file has more than ${maxRows} rows, which is too many to bring in at once.`);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '' && !wasQuoted) { quoted = true; wasQuoted = true; }
    else if (ch === delimiter) endCell();
    else if (ch === '\r') { if (text[i + 1] === '\n') i += 1; endRow(); }
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (quoted) throw new CsvError('A quote in this file is opened and never closed, so the file may be cut short or damaged.');
  if (cell !== '' || row.length) endRow();
  return rows;
}

// A spreadsheet will run a cell that starts with = + - or @ as a formula, so by default those get a quote mark in front when a
// file is written for one. Pass safe: false for an exact copy.
function stringifyCsv(rows, { delimiter = ',', safe = true } = {}) {
  const cell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (safe && /^[=+@\t\r]/.test(text)) text = `'${text}`;
    else if (safe && /^-[^0-9.,\s]/.test(text)) text = `'${text}`;
    return /["\r\n]/.test(text) || text.includes(delimiter) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${rows.map((row) => row.map(cell).join(delimiter)).join('\r\n')}\r\n`;
}

const csvApi = { CsvError, decodeText, detectDelimiter, parseCsv, stringifyCsv };
if (typeof module !== 'undefined' && module.exports) module.exports = csvApi;
else window.ADCsv = csvApi;
