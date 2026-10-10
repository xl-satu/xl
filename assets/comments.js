/* Komentar blog — tanpa server sendiri. Data disimpan di Google Sheets lewat Google Apps Script
   (lihat apps-script/comments.gs). Endpoint diisi di site.config.json -> comments.endpoint. */
(function () {
  'use strict';
  var root = document.getElementById('komentar');
  if (!root) return;
  var endpoint = root.getAttribute('data-endpoint');
  var slug = root.getAttribute('data-slug');
  var max = parseInt(root.getAttribute('data-max'), 10) || 1000;
  var loadedAt = Date.now();

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // selalu textContent -> aman dari XSS
    return n;
  }

  if (!endpoint) {
    root.appendChild(el('p', 'cm-status', 'Komentar belum diaktifkan.'));
    return;
  }

  var list = el('ul', 'cm-list');
  var status = el('p', 'cm-status', 'Memuat komentar…');
  root.appendChild(status);
  root.appendChild(list);

  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function addItem(c) {
    var li = el('li', 'cm-item');
    var head = el('div', 'cm-head');
    head.appendChild(el('span', 'cm-name', c.name));
    head.appendChild(el('span', 'cm-date', fmt(c.date)));
    li.appendChild(head);
    li.appendChild(el('p', 'cm-text', c.text));
    if (c.reply) {
      var r = el('div', 'cm-reply');
      r.appendChild(el('strong', null, 'Balasan: '));
      r.appendChild(document.createTextNode(c.reply));
      li.appendChild(r);
    }
    list.appendChild(li);
  }

  function load() {
    fetch(endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') + 'action=list&slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        list.textContent = '';
        var items = (data && data.comments) || [];
        if (!items.length) { status.textContent = 'Belum ada komentar. Jadilah yang pertama!'; return; }
        status.textContent = items.length + ' komentar';
        items.forEach(addItem);
      })
      .catch(function () { status.textContent = 'Komentar belum bisa dimuat. Coba muat ulang halaman.'; });
  }

  // ---- form ----
  var form = el('form', 'cm-form');
  form.noValidate = true;
  form.innerHTML =
    '<div><label for="cm-name">Nama</label><input type="text" id="cm-name" name="name" maxlength="60" autocomplete="name" required></div>' +
    '<div><label for="cm-text">Komentar</label><textarea id="cm-text" name="text" maxlength="' + max + '" required></textarea></div>' +
    '<div class="cm-hp" aria-hidden="true"><label>Jangan diisi<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
    '<div class="cm-row"><button type="submit" class="cm-btn">Kirim komentar</button><span class="cm-count">0/' + max + '</span></div>' +
    '<p class="cm-msg" role="status" aria-live="polite"></p>';
  root.appendChild(form);

  var nameI = form.elements.name, textI = form.elements.text, hp = form.elements.website;
  var btn = form.querySelector('.cm-btn'), msg = form.querySelector('.cm-msg'), count = form.querySelector('.cm-count');
  try { nameI.value = localStorage.getItem('cm-name') || ''; } catch (e) {}
  textI.addEventListener('input', function () { count.textContent = textI.value.length + '/' + max; });

  function say(text, cls) { msg.textContent = text; msg.className = 'cm-msg ' + (cls || ''); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = nameI.value.trim(), text = textI.value.trim();
    if (!name) { say('Nama wajib diisi.', 'err'); nameI.focus(); return; }
    if (text.length < 3) { say('Komentar terlalu pendek.', 'err'); textI.focus(); return; }
    if (text.length > max) { say('Komentar maksimal ' + max + ' karakter.', 'err'); return; }
    btn.disabled = true; say('Mengirim…');
    // text/plain = "simple request" -> tidak memicu preflight CORS yang tidak didukung Apps Script
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ slug: slug, name: name, text: text, website: hp.value, elapsed: Date.now() - loadedAt })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'gagal');
        try { localStorage.setItem('cm-name', name); } catch (e) {}
        textI.value = ''; count.textContent = '0/' + max;
        say(res.pending ? 'Terima kasih! Komentarmu terkirim dan akan tampil setelah disetujui admin.' : 'Terima kasih! Komentarmu sudah tampil.', 'ok');
        if (!res.pending) { status.textContent = ''; load(); }
      })
      .catch(function (err) {
        say(err && err.message && err.message !== 'gagal' && err.message.length < 120 ? err.message : 'Komentar gagal dikirim. Coba lagi sebentar.', 'err');
      })
      .then(function () { btn.disabled = false; });
  });

  load();
})();
