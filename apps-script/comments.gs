/**
 * BACKEND KOMENTAR BLOG — Google Apps Script + Google Sheets
 *
 * Cara pasang (sekali saja, ±5 menit):
 *  1. Buka sheets.new  -> beri nama "Komentar Blog" (boleh pakai spreadsheet yang sudah ada).
 *  2. Menu Ekstensi > Apps Script. Hapus isi default, tempel seluruh file ini, klik Simpan.
 *  3. (Opsional) isi NOTIFY_EMAIL di bawah supaya ada email tiap ada komentar baru.
 *  4. Klik Deploy > Deployment baru > jenis "Aplikasi web":
 *        Jalankan sebagai: Saya     |     Yang memiliki akses: Siapa saja
 *     Klik Deploy, izinkan akses, lalu salin "URL aplikasi web" (berakhiran /exec).
 *  5. Tempel URL itu ke site.config.json -> "comments" -> "endpoint", commit & push.
 *
 * Moderasi: komentar baru masuk ke sheet "Komentar" dengan kolom "disetujui" = FALSE.
 * Ubah jadi TRUE (centang) -> komentar langsung tampil di blog.
 * Mau membalas? Isi kolom "balasan" -> tampil di bawah komentar.
 * Mau tanpa moderasi? Ubah MODERATE jadi false.
 *
 * Kalau kode ini diubah setelah deploy: Deploy > Kelola deployment > ikon pensil > Versi baru > Deploy.
 */

var MODERATE = true;          // true = komentar harus disetujui dulu
var NOTIFY_EMAIL = '';        // mis. 'emailkamu@gmail.com' ; kosong = tanpa email
var SHEET_NAME = 'Komentar';
var MAX_LEN = 1000;
var MAX_NAME = 60;
var MIN_FILL_MS = 3000;       // form yang terkirim <3 detik setelah dimuat dianggap bot
var MAX_PER_WINDOW = 20;      // batas total komentar baru per jendela waktu (anti banjir)
var WINDOW_SEC = 600;         // 10 menit
var HEADERS = ['waktu', 'slug', 'nama', 'komentar', 'disetujui', 'balasan'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('E2:E').insertCheckboxes();
    sh.setColumnWidth(4, 420);
    sh.setColumnWidth(6, 320);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isTrue_(v) {
  return v === true || ['true', 'ya', 'yes', 'approved', 'ok'].indexOf(String(v).toLowerCase().trim()) > -1;
}

function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+$/g, '').replace(/^\s+/g, '').slice(0, max);
}

/** GET ?action=list&slug=xxx  -> komentar yang sudah disetujui */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'list' || !p.slug) return json_({ ok: true, service: 'comments' });
  var sh = sheet_();
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    rows.forEach(function (r) {
      if (String(r[1]) === p.slug && isTrue_(r[4])) {
        out.push({
          date: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
          name: String(r[2]),
          text: String(r[3]),
          reply: String(r[5] || '')
        });
      }
    });
  }
  return json_({ ok: true, comments: out });
}

/** POST body JSON (text/plain): {slug,name,text,website,elapsed} */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var d;
    try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Data tidak valid.' }); }

    // honeypot / terlalu cepat -> pura-pura sukses supaya bot tidak belajar
    if (d.website || Number(d.elapsed) < MIN_FILL_MS) return json_({ ok: true, pending: true });

    var slug = clean_(d.slug, 120);
    var name = clean_(d.name, MAX_NAME).replace(/\s+/g, ' ');
    var text = clean_(d.text, MAX_LEN);
    if (!/^[\w-]+$/.test(slug)) return json_({ ok: false, error: 'Artikel tidak valid.' });
    if (!name) return json_({ ok: false, error: 'Nama wajib diisi.' });
    if (text.length < 3) return json_({ ok: false, error: 'Komentar terlalu pendek.' });
    if ((text.match(/https?:\/\/|www\./gi) || []).length > 1) return json_({ ok: false, error: 'Maksimal 1 tautan per komentar.' });

    // batas laju global + anti duplikat
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get('rate') || 0);
    if (n >= MAX_PER_WINDOW) return json_({ ok: false, error: 'Terlalu banyak komentar masuk. Coba lagi beberapa menit lagi.' });
    var key = 'dup' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, slug + '|' + name + '|' + text));
    if (cache.get(key)) return json_({ ok: true, pending: MODERATE });
    cache.put(key, '1', 600);
    cache.put('rate', String(n + 1), WINDOW_SEC);

    var sh = sheet_();
    var row = sh.getLastRow() + 1;
    // kolom slug/nama/komentar/balasan diformat teks biasa ('@') -> teks berawalan = + - @ tidak dieksekusi sebagai rumus
    sh.getRange(row, 2, 1, 3).setNumberFormat('@');
    sh.getRange(row, 6).setNumberFormat('@');
    sh.getRange(row, 1, 1, HEADERS.length).setValues([[new Date(), slug, name, text, false, '']]);
    sh.getRange(row, 5).insertCheckboxes();
    sh.getRange(row, 5).setValue(!MODERATE);

    if (NOTIFY_EMAIL) {
      try {
        MailApp.sendEmail(NOTIFY_EMAIL, 'Komentar baru di blog: ' + slug,
          name + ' menulis:\n\n' + text + '\n\n' + (MODERATE ? 'Menunggu persetujuan. Centang kolom "disetujui" di Google Sheet untuk menampilkan.' : 'Sudah tampil di blog.') +
          '\n\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
      } catch (mailErr) { /* email gagal tidak boleh membatalkan komentar */ }
    }
    return json_({ ok: true, pending: MODERATE });
  } catch (err) {
    return json_({ ok: false, error: 'Server sedang sibuk, coba lagi.' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
