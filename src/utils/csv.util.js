// Small, dependency-free CSV builder - the export files here are simple flat
// tables (a handful of columns, no nested structures), so a hand-rolled
// escaper is plenty rather than pulling in a library for it.

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // RFC 4180: a field containing a comma, quote, or newline must be wrapped
  // in quotes, with any internal quote doubled.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// `columns` is [{ header, key? , value? }] - `value(row)` takes priority
// over a plain `key` lookup, for computed/nested/formatted fields (e.g. a
// populated customer's name, or a date formatted as YYYY-MM-DD).
function toCsv(rows, columns) {
  const headerLine = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvValue(typeof c.value === "function" ? c.value(row) : row[c.key]))
      .join(",")
  );
  // CRLF line endings - the RFC 4180 default, and what Excel expects to
  // reliably show each row on its own line rather than one run-on cell.
  return [headerLine, ...lines].join("\r\n");
}

module.exports = { toCsv, escapeCsvValue };
