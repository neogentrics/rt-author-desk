'use strict';
// Reads the sheets of an .xlsx file as rows of text. Cell values are kept exactly as the file stores them, so money can
// be read exactly later (src/shared/money.js). Nothing in the file is ever run: formulas are ignored and only their
// saved results are read.
const { unzipSync, strFromU8 } = require('fflate');
const { XMLParser } = require('fast-xml-parser');

const MAX_UNZIPPED = 200 * 1024 * 1024; // A sales report is a few MB. Anything near this is refused, not read.

class WorkbookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkbookError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (name) => ['sheet', 'Relationship', 'row', 'c', 'si', 'r'].includes(name),
});

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'object') {
    if ('#text' in node) return String(node['#text']);
    if ('t' in node || 'r' in node) return text(node.t) + text(node.r);
  }
  return '';
}

// "C12" -> 2, the zero-based column.
function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref ?? '')?.[1];
  if (!letters) return null;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function readWorkbook(buffer) {
  let files;
  let total = 0;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_UNZIPPED) throw new WorkbookError('This file is too large to be a sales report.');
        return file.name.startsWith('xl/') || file.name === '[Content_Types].xml';
      },
    });
  } catch (error) {
    if (error instanceof WorkbookError) throw error;
    throw new WorkbookError('This isn\'t an Excel workbook (.xlsx), or it\'s damaged.');
  }
  const xml = (name) => (files[name] ? parser.parse(strFromU8(files[name])) : null);
  const workbook = xml('xl/workbook.xml');
  if (!workbook) throw new WorkbookError('This isn\'t an Excel workbook (.xlsx).');

  const shared = (xml('xl/sharedStrings.xml')?.sst?.si ?? []).map(text);
  const targets = new Map();
  for (const rel of xml('xl/_rels/workbook.xml.rels')?.Relationships?.Relationship ?? []) {
    const target = rel['@_Target'].replace(/^\/?(xl\/)?/, '');
    targets.set(rel['@_Id'], `xl/${target}`);
  }

  const sheets = [];
  for (const sheet of workbook.workbook?.sheets?.sheet ?? []) {
    const name = sheet['@_name'];
    const file = targets.get(sheet['@_r:id']);
    const data = file ? xml(file) : null;
    if (!data) throw new WorkbookError(`The sheet "${name}" is missing from the file.`);
    const rows = [];
    for (const row of data.worksheet?.sheetData?.row ?? []) {
      const number = Number(row['@_r']) || rows.length + 1;
      const cells = [];
      for (const cell of row.c ?? []) {
        const at = columnIndex(cell['@_r']) ?? cells.length;
        const type = cell['@_t'];
        let value;
        if (type === 's') value = shared[Number(text(cell.v))] ?? '';
        else if (type === 'inlineStr') value = text(cell.is);
        else value = text(cell.v);
        cells[at] = value;
      }
      rows.push({ number, cells: Array.from(cells, (value) => value ?? '') });
    }
    sheets.push({ name, rows });
  }
  return { sheets, sheet: (name) => sheets.find((item) => item.name === name) ?? null };
}

module.exports = { WorkbookError, columnIndex, readWorkbook };
