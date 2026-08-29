/**
 * Minimal .xlsx writer.
 *
 * An xlsx file is a zip of XML parts, and the exports here are plain tables —
 * strings, numbers and dates, one sheet. That is small enough to emit directly.
 *
 * The alternative was a library, and both realistic options were worse:
 * `xlsx` (SheetJS) on npm is pinned at 0.18.5 with an unfixed high-severity
 * prototype-pollution advisory — fixes ship only from the vendor's own CDN —
 * and `exceljs` pulls 95 packages and expects Node's Buffer/stream in the
 * browser. fflate was already a dependency, so this adds nothing to the tree.
 *
 * Deliberately not a general-purpose writer: no formulas, no merges, no
 * multiple sheets. If a caller ever needs those, reach for a library rather
 * than growing this.
 */
import { zipSync, strToU8 } from "fflate";

export type CellValue = string | number | Date | null | undefined;

/** Escapes the five characters XML cannot carry literally. */
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Strips characters Excel refuses inside a sheet.
 *
 * Control characters are illegal in XML 1.0 even when escaped, and a roster can
 * carry them if a name was pasted from elsewhere — one stray 0x0B would make the
 * whole file unopenable rather than just that cell wrong.
 */
function clean(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** 0-based column index → spreadsheet letters (0 → A, 26 → AA). */
export function colRef(i: number) {
  let ref = "";
  let n = i;
  while (n >= 0) {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  }
  return ref;
}

/** Excel counts days from 1899-12-30, in the sheet's local sense of a date. */
function excelSerial(d: Date) {
  const utcMs = d.getTime() - d.getTimezoneOffset() * 60_000;
  return utcMs / 86_400_000 + 25569;
}

function cellXml(value: CellValue, ref: string, styleId?: number) {
  const s = styleId ? ` s="${styleId}"` : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${s}/>`;
  }
  if (value instanceof Date) {
    // style 2 carries the date number format; without it Excel shows the serial
    return `<c r="${ref}" s="${styleId ?? 2}"><v>${excelSerial(value)}</v></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(
    clean(String(value)),
  )}</t></is></c>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* Three cell formats: 0 default, 1 bold (header), 2 date. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Builds a single-sheet workbook.
 *
 * `header` is styled bold and frozen, so a long roster stays readable while
 * scrolling — the main thing people actually wanted from "make it Excel".
 */
export function buildXlsx({
  header,
  rows,
  sheetName = "Sheet1",
}: {
  header: string[];
  rows: CellValue[][];
  sheetName?: string;
}): Blob {
  const lastCol = colRef(Math.max(0, header.length - 1));
  const lastRow = rows.length + 1;

  const headerXml = `<row r="1">${header
    .map((h, i) => cellXml(h, `${colRef(i)}1`, 1))
    .join("")}</row>`;

  const bodyXml = rows
    .map((row, r) => {
      const n = r + 2;
      return `<row r="${n}">${row
        .map((v, i) => cellXml(v, `${colRef(i)}${n}`))
        .join("")}</row>`;
    })
    .join("");

  // Widths are guessed from content rather than measured — Excel has no
  // autofit-on-open, so an unset width leaves every column at 8 characters and
  // the export reads as a wall of ###.
  const widths = header.map((h, i) => {
    const longest = rows.reduce((max, row) => {
      const cell = row[i];
      const text = cell instanceof Date ? "2026-01-01 00:00" : String(cell ?? "");
      return Math.max(max, text.length);
    }, h.length);
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(
      60,
      Math.max(10, longest + 2),
    )}" customWidth="1"/>`;
  });

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.join("")}</cols>
<sheetData>${headerXml}${bodyXml}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(clean(sheetName)).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });

  return new Blob([zipped as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Saves a workbook under `filename`. */
export function downloadXlsx(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in Safari before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
