'use strict';
const XLSX = require('xlsx');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Builds an in-memory xlsx file from rows (array of arrays, first row is the header)
function xlsxFile(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { name, mimeType: XLSX_MIME, buffer };
}

function importEmpty() {
  return xlsxFile('import-empty.xlsx', [
    ['Name', 'Email', 'Role', 'Created At'],
  ]);
}

function importInvalid() {
  return xlsxFile('import-invalid.xlsx', [
    ['not', 'a', 'real', 'header'],
    ['q', 'admin@test.com', 'admin', 'x'],
    ['easfd', 'asedf', 'referee', '2026-06-06'],
  ]);
}

function nonExcelFile() {
  const csv = 'not,a,header\nrow1,x,y\nrow2,a,b\n';
  return { name: 'not-excel.txt', mimeType: 'text/plain', buffer: Buffer.from(csv) };
}

function usersImport() {
  return xlsxFile('users-import.xlsx', [
    ['Name', 'Email', 'Role', 'Created At'],
    ['Test Admin', 'admin@test.com', 'admin', '2026-06-05'], 
    ['Referee Six', 'referee6@test.com', 'referee', '2026-06-06'],
  ]);
}

function sportsmenImport() {
  return xlsxFile('sportsmen-import.xlsx', [
    ['Name', 'Club', 'Gender', 'Birthyear', 'Routine', 'Group'],
    ['Charlie', 'Test Club 3', 'm', 2010, 'W11', ''],
    ['', 'Test Club 4', 'f', 2011, 'DMT', ''],
  ]);
}

function sportsmenImportGroup() {
  return xlsxFile('sportsmen-import-group.xlsx', [
    ['Name', 'Club', 'Gender', 'Birthyear', 'Routine', 'Group'],
    ['David', 'Test Club 3', 'm', 2010, 'W11', 'GA'],
  ]);
}

function sportsmenImportUnknownGroup() {
  return xlsxFile('sportsmen-import-unknown-group.xlsx', [
    ['Name', 'Club', 'Group'],
    ['Eve', 'Test Club 4', 'XX'],
  ]);
}

module.exports = {
  importEmpty,
  importInvalid,
  nonExcelFile,
  usersImport,
  sportsmenImport,
  sportsmenImportGroup,
  sportsmenImportUnknownGroup,
};
