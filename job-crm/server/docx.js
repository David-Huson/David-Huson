// Turns resume text (Markdown, as Claude writes it) into a .docx file or a print-ready HTML page.
// Hand-rolled so the app keeps zero dependencies: a .docx is a zip of a few XML files.
import { deflateRawSync, crc32 } from 'node:zlib';

/** Markdown subset -> [{ type: 'h1'|'h2'|'h3'|'p'|'li', runs: [{ text, bold, italic }] }] */
export function parseMarkdown(md) {
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) blocks.push({ type: 'p', runs: inline(para.join(' ')) }); para = []; };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line || /^([-*_])\1{2,}$/.test(line) || /^```/.test(line)) flush();
    else if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) { flush(); blocks.push({ type: `h${Math.min(m[1].length, 3)}`, runs: inline(m[2]) }); }
    else if ((m = line.match(/^(?:[-*+•]|\d+[.)])\s+(.*)$/))) { flush(); blocks.push({ type: 'li', runs: inline(m[1]) }); }
    else if (/\s{2}$/.test(raw) || /\\$/.test(line)) { para.push(line.replace(/\\$/, '')); flush(); } // hard line break
    else para.push(line);
  }
  flush();
  return blocks;
}

function inline(text) {
  const runs = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)(?<!\s)\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0;
  const push = (t, style = {}) => t && runs.push({ text: t.replace(/\\([*_#\\[\]`|])/g, '$1'), ...style });
  for (const m of text.matchAll(re)) {
    push(text.slice(last, m.index));
    if (m[1]) push(m[1], { bold: true, italic: true });
    else if (m[2] ?? m[3]) push(m[2] ?? m[3], { bold: true });
    else if (m[4]) push(m[4], { italic: true });
    else if (m[5]) push(/^(mailto:|tel:)/.test(m[6]) || m[5].includes(m[6].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) ? m[5] : `${m[5]} (${m[6]})`);
    else push(m[7]);
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return runs;
}

const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function documentXml(blocks) {
  const run = (r) => `<w:r>${r.bold || r.italic ? `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
  const STYLE = { h1: 'Title', h2: 'Heading1', h3: 'Heading2', li: 'ListBullet', p: null };
  let seenTitle = false;
  const body = blocks.map((b) => {
    // Only the first top-level heading (the name) is the title; later ones are section headings.
    const style = b.type === 'h1' && seenTitle ? 'Heading1' : STYLE[b.type];
    if (b.type === 'h1') seenTitle = true;
    const runs = b.type === 'li' ? `<w:r><w:t xml:space="preserve">•</w:t></w:r><w:r><w:tab/></w:r>${b.runs.map(run).join('')}` : b.runs.map(run).join('');
    return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1008" w:right="1080" w:bottom="1008" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="360" w:hanging="216"/></w:pPr></w:style>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/** Minimal zip writer (deflate, no zip64). */
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8'), nameBuf = Buffer.from(name, 'utf8'), comp = deflateRawSync(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); // fixed timestamp: 1980-01-01
    head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); head.copy(cen, 6, 4, 30); cen.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, comp); central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

export function toDocx(markdown) {
  return zip([
    ['[Content_Types].xml', CONTENT_TYPES], ['_rels/.rels', RELS],
    ['word/document.xml', documentXml(parseMarkdown(markdown))], ['word/styles.xml', STYLES], ['word/_rels/document.xml.rels', DOC_RELS],
  ]);
}

/** Standalone page that prints cleanly; the browser's "Save as PDF" turns it into a PDF. */
export function toPrintHtml(markdown, title) {
  const run = (r) => { let t = xml(r.text); if (r.italic) t = `<em>${t}</em>`; if (r.bold) t = `<strong>${t}</strong>`; return t; };
  let html = '', inList = false, seenTitle = false;
  for (const b of parseMarkdown(markdown)) {
    if (inList && b.type !== 'li') { html += '</ul>'; inList = false; }
    if (b.type === 'li' && !inList) { html += '<ul>'; inList = true; }
    const tag = b.type === 'h1' && seenTitle ? 'h2' : b.type;
    if (b.type === 'h1') seenTitle = true;
    html += `<${tag}>${b.runs.map(run).join('')}</${tag}>`;
  }
  if (inList) html += '</ul>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${xml(title)}</title><style>
@page { size: letter; margin: 0.7in 0.75in; }
body { font: 10.5pt/1.35 Calibri, "Helvetica Neue", Arial, sans-serif; color: #000; background: #fff; max-width: 7in; margin: 0 auto; padding: 24px; }
h1 { font-size: 20pt; margin: 0 0 2pt; } h2 { font-size: 11.5pt; text-transform: uppercase; border-bottom: 1px solid #808080; margin: 12pt 0 4pt; padding-bottom: 1pt; }
h3 { font-size: 11pt; margin: 8pt 0 2pt; } p { margin: 0 0 4pt; } ul { margin: 0 0 4pt; padding-left: 16pt; } li { margin-bottom: 2pt; }
h2, h3 { break-after: avoid; } li { break-inside: avoid; }
.bar { font: 13px system-ui, sans-serif; background: #eef0f4; padding: 10px 14px; border-radius: 8px; margin-bottom: 24px; display: flex; gap: 12px; align-items: center; }
@media print { .bar { display: none; } body { padding: 0; max-width: none; } }
</style></head><body><div class="bar"><button onclick="print()">Print / Save as PDF</button><span>Choose “Save as PDF” as the destination. Turn off headers and footers for a clean page.</span></div>${html}</body></html>`;
}
