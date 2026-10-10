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
</script>` : '';

// link relatif dalam konten ditulis relatif ke root situs (mis. "images/a.webp", "index.html#daftar",
// "post:slug-artikel") lalu diberi prefix sesuai kedalaman halaman.
function fixLinks(html, root) {
  return html
    .replace(/(href|src)="post:([\w-]+)"/g, (_, a, s) => `${a}="${root}blog/${s}.html"`)
    .replace(/(href|src)="(?!https?:|\/\/|#|mailto:|tel:|data:|\/)([^"]*)"/g, (_, a, u) => `${a}="${root}${u}"`);
}

function head({ title, desc, canonical, image, type, extra = '', root }) {
  const img = image ? (/^https?:/.test(image) ? image : `${cfg.siteUrl}/${image}`) : '';
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(cfg.siteName)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">${img ? `<meta property="og:image" content="${img}">` : ''}<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="${root}images/favicon/favicon-32.png">${extra}<style>
${style}</style>${gtag}
</head><body>`;
}

// ---------- halaman artikel ----------
const ctaButtons = (root) => `<a href="${root}index.html#daftar">Cek Coverage</a>
<a href="https://wa.me/${cfg.wa}">Chat WhatsApp</a>`;
const cta = (root, inner = '<p><strong>Mau pasang internet rumah XL SATU?</strong><br>Cek coverage alamatmu gratis, kami bantu sampai terpasang.</p>') =>
  `<div class="box">\n${inner}\n${ctaButtons(root)}\n</div>`;

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
  body = body.replace(/<div class="cta">\n([\s\S]*?)\n<\/div>/, (_, inner) => { customCta = true; return cta(root, inner); }); // ::: cta ... :::
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
${p.cta === false || customCta ? '' : cta(root)}
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

// ---------- tulis ----------
// navigasi di blog.html: link "Blog" aktif; di index/lain tidak dipakai. Nav template sudah menandai Blog "on".
fs.mkdirSync(P('blog'), { recursive: true });
const wanted = new Set(posts.map((p) => `${p.slug}.html`));
for (const f of fs.readdirSync(P('blog'))) if (f.endsWith('.html') && !wanted.has(f)) fs.unlinkSync(P('blog', f)); // artikel yang dihapus/draft ikut hilang
for (const p of posts) fs.writeFileSync(P('blog', `${p.slug}.html`), renderPost(p));
fs.writeFileSync(P('blog.html'), renderIndex());

const urls = [{ loc: `${cfg.siteUrl}/blog.html`, mod: posts[0]?.updated || posts[0]?.date || today },
  ...posts.map((p) => ({ loc: `${cfg.siteUrl}/blog/${p.slug}.html`, mod: p.updated || p.date }))];
fs.writeFileSync(P('sitemap-blog.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod></url>`).join('')}</urlset>`);

console.log(`OK: ${posts.length} artikel -> ${posts.map((p) => p.slug).join(', ')}`);
