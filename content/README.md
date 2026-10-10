# Cara nambah artikel blog

**Paling mudah: pakai panel admin di `/admin/`** (lihat README admin di bawah). Cara manual lewat file ada di bawahnya.

1. Buat file baru di `content/posts/`, misalnya `promo-oktober.md`. Nama file = alamat artikel (`/blog/promo-oktober.html`).
2. Isi dengan format ini:

```
---
title: Judul Artikel
date: 2026-10-12
category: Promo
image: images/banner-x.webp
description: Ringkasan 1-2 kalimat untuk Google.
author: Rizky Sepliansyah   # opsional
draft: true              
comments: false           
updated: 2026-10-20
---

Isi artikel pakai markdown. **Tebal**, *miring*, [link](https://...), ## Subjudul, - daftar.
Link ke artikel lain: [teks](post:slug-artikel). Link ke halaman situs: [daftar](index.html#daftar).
```

3. Commit & push ke GitHub. GitHub Action akan membuat halaman artikel, daftar blog, dan sitemap otomatis.
   (Atau jalankan `node scripts/build.mjs` di komputer, lalu push.)

Blok khusus: `::: note` ... `:::` (kotak info), `::: cta` ... `:::` (kotak ajakan), `::: sources` ... `:::` (sumber).
Kotak ajakan "Cek Coverage" + "Chat WhatsApp" ditambah otomatis di akhir tiap artikel, begitu juga "Baca juga".
Kontak (WA, email, nama) di blog diatur dari `site.config.json`.

## Panel admin (/admin/)
1. Buka `https://domainmu/admin/`.
2. Isi repo (`akun/repo`), branch, dan token GitHub (fine-grained, hanya repo ini, izin *Contents: Read and write*).
3. Klik "+ Artikel baru", tulis, lalu "Simpan & terbitkan". Halaman tayang ±1-2 menit setelahnya.
Token hanya disimpan di browser perangkat itu. Jangan dipakai di perangkat umum.
