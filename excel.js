/* Apia - crea un file Excel (.xlsx) senza librerie esterne.
   Un .xlsx e' una cartella compressa (zip) con dentro alcuni file XML.
   Qui il zip e' "senza compressione": i file sono piccoli e cosi' il codice
   resta corto e funziona anche senza internet.

   Tutte le celle sono scritte come TESTO: cosi' Excel non toglie gli zeri
   iniziali ai telefoni e non trasforma "+39..." in un numero. */

(function (radice, fabbrica) {
  const Excel = fabbrica();
  if (typeof module === 'object' && module.exports) module.exports = Excel;
  else radice.Excel = Excel;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TABELLA_CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(byte) {
    let c = 0xffffffff;
    for (let i = 0; i < byte.length; i++) c = TABELLA_CRC[(c ^ byte[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(s) {
    return new TextEncoder().encode(s);
  }

  // Zip "stored" (metodo 0). file: [{ nome, dati: Uint8Array }]
  function zip(file) {
    const pezzi = [];
    const centrale = [];
    let posizione = 0;
    // data/ora fissa DOS: 1 gennaio 2026 00:00
    const ora = 0, data = ((2026 - 1980) << 9) | (1 << 5) | 1;
    for (const f of file) {
      const nome = utf8(f.nome);
      const crc = crc32(f.dati);
      const n = f.dati.length;
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true);
      loc.setUint16(4, 20, true);
      loc.setUint16(6, 0x0800, true); // nomi in UTF-8
      loc.setUint16(8, 0, true);
      loc.setUint16(10, ora, true);
      loc.setUint16(12, data, true);
      loc.setUint32(14, crc, true);
      loc.setUint32(18, n, true);
      loc.setUint32(22, n, true);
      loc.setUint16(26, nome.length, true);
      loc.setUint16(28, 0, true);
      pezzi.push(new Uint8Array(loc.buffer), nome, f.dati);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, ora, true);
      cen.setUint16(14, data, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, n, true);
      cen.setUint32(24, n, true);
      cen.setUint16(28, nome.length, true);
      cen.setUint32(42, posizione, true);
      centrale.push(new Uint8Array(cen.buffer), nome);
      posizione += 30 + nome.length + n;
    }
    const lungCentrale = centrale.reduce((s, p) => s + p.length, 0);
    const fine = new DataView(new ArrayBuffer(22));
    fine.setUint32(0, 0x06054b50, true);
    fine.setUint16(8, file.length, true);
    fine.setUint16(10, file.length, true);
    fine.setUint32(12, lungCentrale, true);
    fine.setUint32(16, posizione, true);
    const tutto = pezzi.concat(centrale, [new Uint8Array(fine.buffer)]);
    const out = new Uint8Array(tutto.reduce((s, p) => s + p.length, 0));
    let i = 0;
    for (const p of tutto) { out.set(p, i); i += p.length; }
    return out;
  }

  function xml(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function colonna(i) {
    let s = '';
    i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  /* intestazioni: ['Nome', ...]; righe: [['Mario', ...], ...]
     Restituisce i byte del file .xlsx. */
  function crea(intestazioni, righe, nomeFoglio) {
    const tutte = [intestazioni].concat(righe);
    const larghezze = intestazioni.map((_, c) =>
      Math.min(60, Math.max(10, ...tutte.map((r) => String(r[c] == null ? '' : r[c]).length + 2))));
    const colsXml = '<cols>' + larghezze.map((w, c) =>
      '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    const righeXml = tutte.map((r, ri) =>
      '<row r="' + (ri + 1) + '">' + r.map((v, ci) => {
        const rif = colonna(ci) + (ri + 1);
        const stile = ri === 0 ? ' s="1"' : ' s="2"';
        if (v == null || v === '') return '<c r="' + rif + '"' + stile + '/>';
        return '<c r="' + rif + '" t="inlineStr"' + stile + '><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
      }).join('') + '</row>').join('');
    const ultima = colonna(intestazioni.length - 1) + tutte.length;

    const foglio = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<dimension ref="A1:' + ultima + '"/>'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + colsXml + '<sheetData>' + righeXml + '</sheetData>'
      + '<autoFilter ref="A1:' + ultima + '"/>'
      + '</worksheet>';

    const nome = xml(String(nomeFoglio || 'Estrazione').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Estrazione');
    const file = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="' + nome + '" sheetId="1" r:id="rId1"/></sheets>'
        + '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + nome.replace(/'/g, "''") + '\'!$A$1:$' + colonna(intestazioni.length - 1) + '$' + tutte.length + '</definedName></definedNames>'
        + '</workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<numFmts count="0"/>'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="3">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/>'
        + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>'],
      ['xl/worksheets/sheet1.xml', foglio],
    ];
    return zip(file.map(([n, s]) => ({ nome: n, dati: utf8(s) })));
  }

  return { crea, crc32 };
});
