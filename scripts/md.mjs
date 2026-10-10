// Mini markdown renderer, tanpa dependency (supaya build di GitHub Actions tidak perlu npm install).
// Didukung: # heading, paragraf, **tebal**, *miring*, `kode`, [link](url), ![gambar](url),
// daftar (- / 1.) bertingkat, > kutipan, tabel (|a|b|), ---, ```kode```, HTML mentah,
// dan blok kustom:  ::: note ... :::   /   ::: sources ... :::   /   ::: cta ... :::

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function inline(src) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = src;
  // `kode`
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  // tag HTML inline dibiarkan apa adanya
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, (t) => keep(t));
  // gambar
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) =>
    keep(`<img src="${escAttr(url)}" alt="${escAttr(alt)}"${title ? ` title="${escAttr(title)}"` : ''} loading="lazy">`));
  // link
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, text, url, title) => {
    const ext = /^https?:\/\//i.test(url);
    return keep(`<a href="${escAttr(url)}"${title ? ` title="${escAttr(title)}"` : ''}${ext ? ' target="_blank" rel="noopener"' : ''}>`) + text + keep('</a>');
  });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])__([^_\n]+?)__(?![\w])/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*\n]*?)\*(?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?![\w])/g, '$1<em>$2</em>');
  s = s.replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

const isBlank = (l) => /^\s*$/.test(l);
const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function renderList(lines) {
  // lines: baris-baris daftar (boleh bertingkat dengan indentasi)
  const base = lines[0].match(listRe)[1].length;
  const ordered = /\d/.test(lines[0].match(listRe)[2]);
  const items = [];
  for (const line of lines) {
    const m = line.match(listRe);
    if (m && m[1].length <= base) items.push({ text: m[3], children: [] });
    else if (items.length) items[items.length - 1].children.push(line);
  }
  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((it) => {
    const kids = it.children.filter((l) => listRe.test(l));
    const cont = it.children.filter((l) => !listRe.test(l)).map((l) => l.trim()).join(' ');
    return `<li>${inline((it.text + ' ' + cont).trim())}${kids.length ? renderList(kids) : ''}</li>`;
  }).join('\n');
  return `<${tag}>\n${body}\n</${tag}>`;
}

function renderTable(rows) {
  const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<div class="tbl"><table>\n<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>\n<tbody>\n` +
    body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n') + '\n</tbody></table></div>';
}

export function render(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    // blok kode
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // container ::: nama
    let m = line.match(/^:::\s*([\w-]+)\s*$/);
    if (m) {
      const buf = []; i++;
      let depth = 1;
      while (i < lines.length) {
        if (/^:::\s*[\w-]+\s*$/.test(lines[i])) depth++;
        else if (/^:::\s*$/.test(lines[i]) && --depth === 0) break;
        buf.push(lines[i++]);
      }
      i++;
      out.push(`<div class="${m[1]}">\n${render(buf.join('\n'))}\n</div>`);
      continue;
    }
    // heading
    m = line.match(/^(#{1,4})\s+(.*?)\s*#*\s*$/);
    if (m) {
      const n = m[1].length;
      const id = m[2].toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out.push(`<h${n}${id ? ` id="${id}"` : ''}>${inline(m[2])}</h${n}>`);
      i++; continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    // kutipan
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>\n${render(buf.join('\n'))}\n</blockquote>`);
      continue;
    }
    // tabel
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const buf = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(renderTable(buf));
      continue;
    }
    // daftar
    if (listRe.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i]) && (listRe.test(lines[i]) || /^\s+\S/.test(lines[i]))) buf.push(lines[i++]);
      out.push(renderList(buf));
      continue;
    }
    // HTML mentah (blok)
    if (/^<(div|p|section|table|figure|iframe|details|ul|ol|h[1-6]|img|a|hr|aside|video|blockquote|script)\b/i.test(line)) {
      const buf = [];
      while (i < lines.length && !isBlank(lines[i])) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }
    // paragraf
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4}\s|```|:::|>\s?)/.test(lines[i]) && !(buf.length && listRe.test(lines[i]))) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.map((l) => l.replace(/\s+$/, (sp) => (sp.length >= 2 ? '<br>' : ''))).join(' ').replace(/<br> /g, '<br>').trim())}</p>`);
  }
  return out.join('\n');
}
