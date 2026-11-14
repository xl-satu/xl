// Build blog otomatis:  content/posts/*.md  ->  blog/<slug>.html, blog.html, sitemap-blog.xml
// Jalankan:  node scripts/build.mjs        (tanpa npm install)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => fs.readFileSync(P(f), 'utf8');
const cfg = JSON.parse(read('site.config.json'));

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtLong = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const fmtShort = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // WIB

// ---------- baca artikel ----------
function parsePost(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: frontmatter (--- ... ---) tidak ditemukan`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([\w-]+):\s*(.*)$/);
    if (!k) continue;
    let v = k[2].trim();
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    meta[k[1]] = v === 'true' ? true : v === 'false' ? false : v;
  }
  meta.slug = meta.slug || path.basename(file, '.md');
  for (const req of ['title', 'date', 'description', 'category']) if (!meta[req]) throw new Error(`${file}: field "${req}" wajib diisi`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date harus YYYY-MM-DD`);
  meta.body = m[2].trim();
  const words = meta.body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  meta.minutes = Math.max(1, Math.round(words / 200));
  return meta;
}

const posts = fs.readdirSync(P('content/posts')).filter((f) => f.endsWith('.md')).map((f) => parsePost(P('content/posts', f)))
  .filter((p) => !p.draft && p.date <= today)
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

const slugs = new Set();
for (const p of posts) { if (slugs.has(p.slug)) throw new Error(`slug ganda: ${p.slug}`); slugs.add(p.slug); }

// ---------- template ----------
const style = read('templates/style.css');
const navT = read('templates/partials-nav.html');
const footT = read('templates/partials-footer.html');
const vars = (s, root) => s.replace(/\{\{root\}\}/g, root).replace(/\{\{wa\}\}/g, cfg.wa).replace(/\{\{phone\}\}/g, esc(cfg.phone))
  .replace(/\{\{email\}\}/g, esc(cfg.email)).replace(/\{\{owner\}\}/g, esc(cfg.owner));
const gtag = cfg.gtagId ? `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.gtagId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${cfg.gtagId}');
${cfg.gtagConversion ? `
  // Konversi Google Ads: klik tombol WhatsApp (sama seperti di index.html)
  function gtag_report_conversion(url) {
    var callback = function () { if (typeof(url) != 'undefined') { window.location = url; } };
    var now = Date.now();
    if (window.__cvAt && now - window.__cvAt < 1500) { if (typeof(url) != 'undefined') { callback(); } return false; }
    window.__cvAt = now;
    if (typeof gtag !== 'function') { callback(); return false; }
${cfg.gtagOutbound ? `    gtag('event', 'conversion', {'send_to': '${cfg.gtagOutbound}', 'value': 1.0, 'currency': 'IDR'}); // Klik keluar\n` : ''}    gtag('event', 'conversion', {
        'send_to': '${cfg.gtagConversion}',
        'value': 1.0,
        'currency': 'IDR',
        'event_callback': callback
    });
    return false;
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="wa.me"]') : null;
    if (a) { try { gtag_report_conversion(); } catch (err) {} }
  });` : ''}
</script>` : '';

// link relatif dalam konten ditulis relatif ke root situs (mis. "images/a.webp", "index.html#daftar",
// "post:slug-artikel") lalu diberi prefix sesuai kedalaman halaman.
function fixLinks(html, root) {
  return html
    .replace(/(href|src)="post:([\w-]+)"/g, (_, a, s) => `${a}="${root}blog/${s}.html"`)
    .replace(/(href|src)="(?!https?:|\/\/|#|mailto:|tel:|data:|\/|\.\.\/)([^"]*)"/g, (_, a, u) => `${a}="${root}${u}"`);
}

function head({ title, desc, canonical, image, type, extra = '', root }) {
  const img = image ? (/^https?:/.test(image) ? image : `${cfg.siteUrl}/${image}`) : '';
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(cfg.siteName)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">${img ? `<meta property="og:image" content="${img}">` : ''}<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="${root}images/favicon/favicon-32.png">${extra}<style>
${style}</style>${gtag}
</head><body>`;
}

// ---------- halaman artikel ----------
const waText = (text) => `https://wa.me/${cfg.wa}?text=${encodeURIComponent(text)}`;
const ctaButtons = (root, title) => `<a href="${root}cek-coverage.html">Cek Coverage</a>
<a href="${waText(title ? `Halo, saya baca artikel "${title}" di blog Anda dan mau tanya soal XL HOME.` : 'Halo, saya mau tanya soal XL HOME.')}">Chat WhatsApp</a>`;
const cta = (root, inner = '<p><strong>Mau pasang internet rumah XL SATU?</strong><br>Cek coverage alamatmu gratis, kami bantu sampai terpasang.</p>', title = '') =>
  `<div class="box">\n${inner}\n${ctaButtons(root, title)}\n</div>`;

function related(post, root) {
  const others = posts.filter((p) => p.slug !== post.slug);
  const same = others.filter((p) => p.category === post.category);
  const pick = [...same, ...others.filter((p) => !same.includes(p))].slice(0, 3);
  if (!pick.length) return '';
  return `<h2>Baca juga</h2><ul class="related">${pick.map((p) => `<li><a href="${root}blog/${p.slug}.html">${esc(p.title)}</a></li>`).join('')}</ul>`;
}

function renderPost(p) {
  const root = '../';
  const url = `${cfg.siteUrl}/blog/${p.slug}.html`;
  const author = p.author || cfg.defaultAuthor;
  const modified = p.updated || p.date;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description,
    datePublished: p.date, dateModified: modified, mainEntityOfPage: url,
    ...(p.image ? { image: `${cfg.siteUrl}/${p.image}` } : {}),
    author: { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: cfg.siteName, logo: { '@type': 'ImageObject', url: `${cfg.siteUrl}/images/logo.png` } },
  };
  const extra = `<meta property="article:published_time" content="${p.date}"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  let body = render(p.body);
  let customCta = false;
  body = body.replace(/<div class="cta">\n([\s\S]*?)\n<\/div>/, (_, inner) => { customCta = true; return cta(root, inner, p.title); }); // ::: cta ... :::
  body = fixLinks(body, root);
  const showComments = cfg.comments && cfg.comments.enabled && p.comments !== false;
  const comments = showComments ? `
<section class="comments" id="komentar" data-slug="${p.slug}" data-endpoint="${esc(cfg.comments.endpoint || '')}" data-max="${cfg.comments.maxLength || 1000}">
<h2>Komentar</h2>
<noscript><p>Aktifkan JavaScript untuk melihat dan menulis komentar.</p></noscript>
</section>` : '';
  return head({ title: `${p.title} | Blog ${cfg.siteName}`, desc: p.description, canonical: url, image: p.image, type: 'article', extra, root }) +
    vars(navT, root) +
    `<article>
<p class="crumb"><a href="${root}index.html">Beranda</a> / <a href="${root}blog.html">Blog</a> / ${esc(p.category)}</p>
<h1>${esc(p.title)}</h1>
<p class="meta"><time datetime="${p.date}">${fmtLong(p.date)}</time> &middot; Oleh ${esc(author)} &middot; ${p.minutes} menit baca</p>
${p.image ? `<img class="hero" src="${root}${p.image}" alt="${esc(p.imageAlt || p.title)}" width="1080" height="360">` : ''}
${body}
${p.cta === false || customCta ? '' : cta(root, undefined, p.title)}
${related(p, root)}${comments}
</article>
` + vars(footT, root) +
    (showComments ? `<script src="${root}assets/comments.js" defer></script>` : '') + '</body></html>\n';
}

// ---------- halaman daftar blog ----------
function renderIndex() {
  const root = '';
  const cats = cfg.categories.filter((c) => posts.some((p) => p.category === c));
  for (const p of posts) if (!cats.includes(p.category)) cats.push(p.category);
  const cards = posts.map((p) => `<div class="card" data-cat="${esc(p.category)}"><a href="blog/${p.slug}.html">${p.image ? `<img src="${p.image}" alt="${esc(p.imageAlt || p.title)}" loading="lazy" width="1080" height="360">` : ''}<time datetime="${p.date}">${fmtShort(p.date)}</time><h2>${esc(p.title)}</h2><span class="more">Baca Selengkapnya &rsaquo;</span></a></div>`).join('');
  const desc = `Artikel tips, panduan, dan promo internet rumah ${cfg.siteName} untuk keluarga di Jabodetabek.`;
  return head({ title: `Blog ${cfg.siteName} | Tips, Panduan & Promo Internet Rumah`, desc, canonical: `${cfg.siteUrl}/blog.html`, image: posts[0]?.image, type: 'website', root }) +
    vars(navT, root) +
    `<main class="wrap"><h1>Blog ${esc(cfg.siteName)}</h1><div class="chips"><button class="chip on" data-f="All">All</button>${cats.map((c) => `<button class="chip" data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="grid" id="g">${cards}</div></main>` +
    vars(footT, root) +
    `<script>document.querySelectorAll('.chip').forEach(function(b){b.onclick=function(){document.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')});b.classList.add('on');var f=b.dataset.f;document.querySelectorAll('.card').forEach(function(c){c.style.display=(f==='All'||c.dataset.cat===f)?'':'none'})}});</script></body></html>\n`;
}


// ---------- halaman area: Jakarta Pusat / Jakarta Barat (berbasis index.html) ----------
const areaData = JSON.parse(read('content/areas.json'));
const rp = (n) => 'Rp' + n.toLocaleString('id-ID');
const waLink = (text) => `https://wa.me/${cfg.wa}?text=${encodeURIComponent(text)}`;

// Halaman area dibuat dari index.html (tampilan sama persis dengan beranda),
// lalu judul/meta/schema diganti dan ditambah bagian "Cakupan Kelurahan".
// Ubah index.html -> jalankan build -> halaman area ikut berubah.
function renderArea(a) {
  const url = `${cfg.siteUrl}/${a.slug}.html`;
  const other = areaData.areas.find((x) => x.slug === a.other);
  const kecs = Object.entries(a.kelurahan);
  const totalKel = kecs.reduce((n, [, v]) => n + v.length, 0);
  const confirmed = new Set(a.confirmed || []);
  let h = read('index.html');

  const mustRe = (re, rep) => {
    if (!re.test(h)) throw new Error(`index.html: pola tidak ditemukan untuk halaman ${a.slug}: ${re}`);
    h = h.replace(re, typeof rep === 'function' ? rep : () => rep);
  };
  const mustStr = (from, to) => {
    if (!h.includes(from)) throw new Error(`index.html: teks tidak ditemukan untuk halaman ${a.slug}: ${from.slice(0, 60)}`);
    h = h.replace(from, () => to);
  };
  const setAttr = (re, val) => mustRe(re, (m, p1, p2) => p1 + esc(val) + p2);

  // ---- meta & judul ----
  mustRe(/<title>[\s\S]*?<\/title>/, `<title>${esc(a.title)}</title>`);
  setAttr(/(<meta name="description" content=")[^"]*(")/, a.desc);
  setAttr(/(<meta property="og:title" content=")[^"]*(")/, a.title);
  setAttr(/(<meta property="og:description" content=")[^"]*(")/, a.desc);
  setAttr(/(<meta property="og:url" content=")[^"]*(")/, url);
  setAttr(/(<link rel="canonical" href=")[^"]*(")/, url);
  setAttr(/(<meta name="twitter:title" content=")[^"]*(")/, a.title);
  setAttr(/(<meta name="twitter:description" content=")[^"]*(")/, a.desc);

  // ---- schema.org (menggantikan JSON-LD beranda) ----
  const faqLd = a.faq.map(([q, ans]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: ans } }));
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${cfg.siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: a.name, item: url } ] },
      { '@type': 'Service', '@id': `${url}#service`, name: `Pasang WiFi XL SATU (XL HOME) ${a.name}`,
        serviceType: 'Internet rumah FWA 5G dan Fiber Optik (FTTH)', url,
        provider: { '@type': 'Organization', '@id': `${cfg.siteUrl}/#org`, name: 'XL SATU - Sales Resmi Jabodetabek', url: `${cfg.siteUrl}/`, telephone: `+${cfg.wa}` },
        areaServed: { '@type': 'AdministrativeArea', name: a.name,
          containsPlace: kecs.map(([kec, list]) => ({ '@type': 'AdministrativeArea', name: `Kecamatan ${kec}, ${a.name}`,
            containsPlace: list.map((k) => ({ '@type': 'AdministrativeArea', name: `Kelurahan ${k}, Kecamatan ${kec}, ${a.name}` })) })) },
        description: a.desc,
        hasOfferCatalog: { '@type': 'OfferCatalog', name: `Paket Internet Rumah XL SATU ${a.name}`, itemListElement: areaData.packages.map((k) => ({
          '@type': 'Offer', name: `${k.name} ${k.speed}`, description: k.schemaDesc, price: String(k.price), priceCurrency: 'IDR', url: `${url}#paket`,
          priceSpecification: { '@type': 'UnitPriceSpecification', price: String(k.price), priceCurrency: 'IDR', unitCode: 'MON', valueAddedTaxIncluded: false } })) } },
      { '@type': 'FAQPage', mainEntity: faqLd }
    ]
  };
  mustRe(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);

  // ---- navigasi: logo balik ke beranda, link ke bagian kelurahan ----
  mustStr('<a href="#header" class="logo-link" onclick="goHome();return false;" aria-label="Kembali ke beranda">',
    '<a href="index.html" class="logo-link" aria-label="Kembali ke beranda">');
  mustStr('<a href="#header" onclick="goHome();return false;" aria-label="Kembali ke beranda">',
    '<a href="index.html" aria-label="Kembali ke beranda">');
  mustRe(/(<div class="nav-links">\s*<a href="#paket"[^>]*>Paket<\/a>)/,
    (m) => `${m}\n  <a href="#coverage" onclick="goToSection('coverage');return false;">Kelurahan</a>`);
  mustRe(/(<div class="nav-more-menu"[^>]*>\s*)(<a role="menuitem" href="#paket"[^>]*>Paket<\/a>)/,
    (m, p1, p2) => `${p1}<a role="menuitem" href="index.html">Beranda</a>\n  ${p2}\n  <a role="menuitem" href="#coverage" onclick="closeNavMenu();goToSection('coverage');return false;">Kelurahan</a>`);

  // ---- judul bagian paket ----
  mustStr('<h1 class="section-title">Pilih Paket Internet XL SATU</h1>', `<h1 class="section-title">${esc(a.h1)}</h1>`);
  mustStr('<div class="section-sub">Melayani Jakarta Pusat, Jakarta Barat &amp; Jabodetabek. Ketersediaan mengikuti alamat</div>',
    `<div class="section-sub">Paket internet rumah XL SATU (XL HOME) untuk ${esc(a.name)}. Ketersediaan mengikuti alamat pemasangan</div>`);

  // ---- cakupan kelurahan + FAQ area (menggantikan FAQ beranda) ----
  const waArea = waLink(`Halo, saya tertarik pasang XL SATU (XL HOME) di area ${a.name}. Boleh cek coverage dan info promo?`);
  const kecCards = kecs.map(([kec, list]) => `<article class="cov-kec" data-kec="${esc(kec)}"><header><h3>Kecamatan ${esc(kec)}</h3><span>${list.length} kelurahan</span></header><ul>${list.map((k) => `<li><a class="cov-kel${confirmed.has(k) ? ' ok' : ''}" href="${esc(waLink(`Halo, saya di Kel. ${k}, Kec. ${kec}, ${a.name}. Boleh dicek apakah XL HOME bisa dipasang di sini?`))}" target="_blank" rel="noopener noreferrer" data-kel="${esc(k)}" data-kec="${esc(kec)}">${esc(k)}${confirmed.has(k) ? '<i>Tersedia</i>' : ''}</a></li>`).join('')}</ul></article>`).join('\n');
  const legend = confirmed.size
    ? '<p class="cov-note">Label <b>Tersedia</b> = jaringan sudah terkonfirmasi di kelurahan tersebut. Kelurahan lain tetap bisa dicek per alamat.</p>'
    : '<p class="cov-note">Ketersediaan Fiber atau FWA 5G berbeda di tiap gang dan tiap jalan, jadi kami cek langsung per alamat pemasangan kamu.</p>';
  const covJs = `(function(){
  var q=document.getElementById('cov-q'),empty=document.getElementById('cov-empty');
  var cards=[].slice.call(document.querySelectorAll('.cov-kec'));
  function low(s){return (s||'').toLowerCase();}
  if(q)q.addEventListener('input',function(){
    var t=low(q.value).trim(),any=false;
    cards.forEach(function(c){
      var km=low(c.getAttribute('data-kec')).indexOf(t)>-1,shown=0;
      [].forEach.call(c.querySelectorAll('.cov-kel'),function(b){
        var m=!t||km||low(b.getAttribute('data-kel')).indexOf(t)>-1;
        b.parentNode.hidden=!m;if(m)shown++;
      });
      c.hidden=shown===0;if(shown)any=true;
    });
    if(empty)empty.hidden=any;
  });
})();`;
  const covSection = `<!-- CAKUPAN KELURAHAN -->
  <div class="section cov" id="coverage">
  <h2 class="section-title">Cakupan Kelurahan di ${esc(a.name)}</h2>
  <div class="section-sub">${kecs.length} kecamatan &middot; ${totalKel} kelurahan. Ketuk kelurahanmu untuk langsung chat sales dan cek jaringan XL SATU.</div>
  <div class="cov-about">${a.about.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
  <div class="cov-search"><input type="search" id="cov-q" placeholder="Cari kelurahan atau kecamatan..." aria-label="Cari kelurahan atau kecamatan" autocomplete="off"></div>
  <div class="cov-grid">
${kecCards}
  </div>
  <p class="cov-empty" id="cov-empty" hidden>Kelurahan tidak ditemukan. Kirim alamatmu lewat WhatsApp, kami bantu cek manual.</p>
  ${legend}
  <p class="cov-cta">Ketuk nama kelurahanmu untuk langsung chat sales di WhatsApp, atau <a href="${waArea}" target="_blank" rel="noopener noreferrer">chat WhatsApp Sales</a> tanpa memilih kelurahan. Mau kirim alamat sekalian? Buka <a href="cek-coverage.html">halaman Cek Coverage</a>.${other ? ` Tinggal di area lain? Lihat juga <a href="${other.slug}.html">pasang WiFi XL SATU di ${esc(other.name)}</a>.` : ''}</p>
  </div>
  <script>${covJs}</script>

  <!-- FAQ -->
  <div class="section faq" id="faq">
  <h2 class="section-title">Pertanyaan Umum Pasang WiFi di ${esc(a.name)}</h2>
  <div class="section-sub">Jawaban singkat sebelum kamu daftar</div>
  ${a.faq.map(([qq, ans]) => `<details><summary>${esc(qq)}</summary><p>${esc(ans)}</p></details>`).join('')}
  </div>`;
  mustRe(/<!-- FAQ -->\s*<div class="section faq" id="faq">[\s\S]*?<\/script>/, covSection);

  // ---- pesan WA umum di beranda -> spesifik area ----
  const genMsg = encodeURIComponent('Halo, saya mau cek apakah XL HOME bisa dipasang di area saya.');
  mustStr(genMsg, genMsg);
  h = h.split(genMsg).join(encodeURIComponent(`Halo, saya mau cek apakah XL HOME bisa dipasang di area ${a.name}.`));
  const genTail = 'bisa%20dipasang%20di%20area%20saya%3F';
  mustStr(genTail, genTail);
  h = h.split(genTail).join(encodeURIComponent(`bisa dipasang di area ${a.name}?`));

  // ---- halaman privasi beranda tidak diduplikasi di halaman area ----
  mustRe(/<!-- PRIVACY PAGE -->[\s\S]*?<!-- FOOTER -->/, '<div id="page-privacy"></div>\n\n<!-- FOOTER -->');

  // ---- gaya bagian kelurahan ----
  const css = `<style>
 .cov-about { max-width: 860px; margin: 0 auto 20px; text-align: center; color: var(--gray-text); font-size: 15px; line-height: 1.7; }
 .cov-about p + p { margin-top: 8px; }
 .cov-search { max-width: 480px; margin: 0 auto 22px; }
 .cov-search input { width: 100%; padding: 12px 16px; border: 1.5px solid #D5E0F5; border-radius: 12px; font: inherit; font-size: 15px; background: #fff; color: var(--dark); }
 .cov-search input:focus { outline: none; border-color: var(--blue-mid); }
 .cov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
 .cov-kec { background: #fff; border: 1px solid #E2EAF8; border-radius: 16px; box-shadow: var(--shadow); padding: 18px 18px 16px; }
 .cov-kec header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 12px; }
 .cov-kec h3 { font-size: 17px; font-weight: 800; color: var(--blue); }
 .cov-kec header span { font-size: 12px; color: var(--gray-mid); white-space: nowrap; }
 .cov-kec ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
 .cov-kel { display: inline-block; text-decoration: none; font: inherit; font-size: 13px; color: var(--blue-mid); background: var(--sky); border: 1px solid transparent; border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: border-color .15s, background .15s; }
 .cov-kel:hover { border-color: var(--blue-mid); background: #fff; }
 .cov-kel.ok { background: #E6F7F5; color: #067A72; }
 .cov-kel i { font-style: normal; font-size: 10px; font-weight: 700; margin-left: 6px; background: var(--teal); color: #fff; border-radius: 999px; padding: 1px 6px; }
 .cov-kec[hidden], .cov-kec li[hidden], .cov-empty[hidden] { display: none !important; }
 .cov-empty { text-align: center; color: var(--gray-text); font-size: 14px; margin-top: 16px; }
 .cov-note, .cov-cta { text-align: center; font-size: 13px; color: var(--gray-mid); margin-top: 18px; line-height: 1.6; }
 .cov-cta a { color: var(--blue); font-weight: 600; }
 @media (max-width: 700px) { .cov-grid { grid-template-columns: 1fr; } }
</style>
</head>`;
  mustStr('</head>', css);

  return h;
}


// ---------- halaman Cek Coverage (templates/cek-coverage.html) ----------
function renderCek() {
  const root = '';
  const url = `${cfg.siteUrl}/cek-coverage.html`;
  const title = 'Cek Coverage WiFi XL SATU (XL HOME) Gratis | Jakarta & Jabodetabek';
  const desc = 'Cek ketersediaan WiFi XL SATU (XL HOME) di alamatmu. Gratis. Chat sales via WhatsApp atau pilih kelurahan di Jakarta Pusat dan Jakarta Barat.';
  const faq = [
    ['Apakah cek coverage dikenakan biaya?', 'Tidak. Cek coverage gratis.'],
    ['Apakah saya harus mengisi form untuk cek coverage?', 'Tidak. Kamu bisa langsung chat sales lewat WhatsApp. Mengirim kelurahan atau titik lokasi bersifat opsional, hanya supaya pengecekan lebih cepat.'],
    ['Kenapa ketersediaan jaringan dicek per alamat?', 'Ketersediaan Fiber atau FWA 5G berbeda di tiap gang dan tiap jalan, jadi kami cek langsung per alamat pemasangan kamu.'],
    ['Apa yang terjadi setelah saya chat?', 'Tim kami mengecek jangkauan di alamatmu, lalu mengabari paket yang tersedia.'],
  ];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${cfg.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Cek Coverage', item: url } ] },
    { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } ] };
  const extra = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  const areaCards = areaData.areas.map((a) => {
    const kel = Object.values(a.kelurahan).reduce((n, v) => n + v.length, 0);
    return `<a class="ck-area" href="${a.slug}.html#coverage"><strong>${esc(a.name)}</strong><span>${Object.keys(a.kelurahan).length} kecamatan &middot; ${kel} kelurahan. Ketuk kelurahanmu, langsung chat sales.</span></a>`;
  }).join('\n');
  const faqHtml = faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  let body = read('templates/cek-coverage.html')
    .replace(/\{\{areaCards\}\}/g, areaCards)
    .replace(/\{\{faq\}\}/g, faqHtml)
    .replace(/\{\{waGeneral\}\}/g, esc(waText('Halo, saya mau cek apakah XL HOME bisa dipasang di area saya.')))
    .replace(/\{\{waOther\}\}/g, esc(waText('Halo, saya mau cek XL HOME di area Jabodetabek di luar Jakarta Pusat dan Jakarta Barat. Bisa dibantu?')));
  const nav = vars(navT, root).replace(' class="on"', ''); // Blog tidak aktif di halaman ini
  return head({ title, desc, canonical: url, image: 'images/og-paket.png', type: 'website', extra, root }) +
    nav + vars(body, root) + vars(footT, root) + '</body></html>\n';
}

// ---------- tulis ----------
// navigasi di blog.html: link "Blog" aktif; di index/lain tidak dipakai. Nav template sudah menandai Blog "on".
fs.mkdirSync(P('blog'), { recursive: true });
const wanted = new Set(posts.map((p) => `${p.slug}.html`));
for (const f of fs.readdirSync(P('blog'))) if (f.endsWith('.html') && !wanted.has(f)) fs.unlinkSync(P('blog', f)); // artikel yang dihapus/draft ikut hilang
for (const p of posts) fs.writeFileSync(P('blog', `${p.slug}.html`), renderPost(p));
fs.writeFileSync(P('blog.html'), renderIndex());
for (const a of areaData.areas) fs.writeFileSync(P(`${a.slug}.html`), renderArea(a));
fs.writeFileSync(P('cek-coverage.html'), renderCek());

const urls = [{ loc: `${cfg.siteUrl}/blog.html`, mod: posts[0]?.updated || posts[0]?.date || today },
  ...posts.map((p) => ({ loc: `${cfg.siteUrl}/blog/${p.slug}.html`, mod: p.updated || p.date }))];
fs.writeFileSync(P('sitemap-blog.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod></url>`).join('')}</urlset>`);

// sitemap.xml lengkap: homepage + halaman statis + blog + semua artikel
const allUrls = [
  ...(cfg.staticPages || []).map((s) => ({ loc: `${cfg.siteUrl}/${s.path}`, mod: s.lastmod })),
  ...urls,
];
fs.writeFileSync(P('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod></url>`).join('\n')}\n</urlset>\n`);

console.log(`Area: ${areaData.areas.map((a) => a.slug).join(', ')}`);
console.log(`OK: ${posts.length} artikel -> ${posts.map((p) => p.slug).join(', ')}`);
