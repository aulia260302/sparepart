// =========================================================================
// 1. KONEKSI UTAMA KE BACKEND CLOUD SUPABASE
// =========================================================================
const SUPABASE_URL = "https://cwwvgsojguutvnhhzqcn.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3d3Znc29qZ3V1dHZuaGh6cWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4ODI3MTcsImV4cCI6MjA5ODQ1ODcxN30.na1y4-7QlDCRSNmKRZ_SAKFufKKZJV5mUI9_yLidhUs"; 

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DATABASE MASTER INVENTORI BARANG GUDANG STATIC
let DB_BARANG = [
  {kode:'BRG-001', nama:'Bearing 2307 H', alias:'laher, bering', lokasi:'B2-R', stok:24, satuan:'pcs', desc:'Bearing Bola Baris Ganda Self-aligning.'},
  {kode:'BRG-002', nama:'Bearing 6205 ZZ', alias:'laher bak magnet', lokasi:'B2-L', stok:18, satuan:'pcs', desc:'Bearing deep groove pelindung besi.'},
  {kode:'OSL-001', nama:'O-Seal 25mm', alias:'karet sil, siel', lokasi:'C1-L', stok:50, satuan:'pcs', desc:'Karet seal nitrile anti oli dan panas.'},
  {kode:'SLG-001', nama:'Selang Hidrolik 1/2"', alias:'hose hydraulic', lokasi:'D1-R', stok:30, satuan:'m', desc:'Tekanan tinggi serat kawat baja ganda.'},
  {kode:'PLU-001', nama:'Pelumas Grease Heavy Duty', alias:'gemuk, stempet', lokasi:'A2-R', stok:12, satuan:'kg', desc:'Pelumas lithium temperatur tinggi.'}
];

// STATE ARRAYS UNTUK RUNTIME INTERAKSI (DI-SYNC KE SUPABASE NANTI)
let DB_KARYAWAN_HR = []; // Diisi via form HR atau ditarik dari tabel Supabase
let EDIT_KARYAWAN_ID = null; // null = mode tambah baru, terisi id = mode edit
let LIVE_ANTREAN_ADMIN = [];
let DATA_KERANJANG = [];
let DB_TUJUAN = []; // Daftar tujuan keperluan (dikelola admin, tersimpan di Supabase)
let sessionUser = { nama: '', dept: '', keperluan: '' };

// TIMER DIGITAL HEADER
setInterval(() => {
  const now = new Date();
  document.getElementById('live-clock').textContent = now.toLocaleTimeString('id-ID');
  document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
}, 1000);

// SCENE NAVIGATION MANAGER
function ubahTampilanLayar(sceneId) {
  document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
  document.getElementById(sceneId).classList.add('active');

  // Selalu tarik data terbaru dari Supabase saat masuk dashboard
  if (sceneId === 'scene-admin') muatPermintaanDariDB().then(renderWorkspaceAdmin);
  if (sceneId === 'scene-katalog') muatBarangDariDB().then(renderKatalogAdmin);
  if (sceneId === 'scene-hr') {
    // Selalu mulai dari dashboard Daftar Karyawan; modal & halaman import tertutup
    document.getElementById('hr-form-modal-overlay').classList.add('hidden');
    document.getElementById('hr-view-import').classList.add('hidden');
    document.getElementById('hr-view-list').classList.remove('hidden');
    muatKaryawanDariDB().then(renderTabelHR);
  }
}

function keluarKePortal() { ubahTampilanLayar('scene-portal'); }

// =========================================================================
// 🪟 MODAL POP-UP KUSTOM (PENGGANTI alert/confirm/prompt BAWAAN BROWSER)
// =========================================================================
function bukaModal({ icon = 'ℹ️', title = '', message = '', type = 'alert', inputValue = '', danger = false, buttons = [] }) {
  const overlay = document.getElementById('app-modal-overlay');
  const inputEl = document.getElementById('app-modal-input');
  const actionsEl = document.getElementById('app-modal-actions');

  document.getElementById('app-modal-icon').textContent = icon;
  document.getElementById('app-modal-title').textContent = title;
  document.getElementById('app-modal-message').textContent = message;

  if (type === 'prompt') {
    inputEl.classList.remove('hidden');
    inputEl.value = inputValue;
  } else {
    inputEl.classList.add('hidden');
  }

  actionsEl.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = `btn ${b.primary ? (danger ? 'btn-modal-danger' : 'btn-modal-primary') : 'btn-modal-cancel'}`;
    btn.textContent = b.label;
    btn.onclick = () => { tutupModal(); b.action(inputEl.value); };
    actionsEl.appendChild(btn);
  });

  overlay.classList.remove('hidden');
  if (type === 'prompt') setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
}

function tutupModal() { document.getElementById('app-modal-overlay').classList.add('hidden'); }

function showAlert(message, title = 'Informasi', icon = 'ℹ️') {
  return new Promise(resolve => {
    bukaModal({ icon, title, message, type: 'alert', buttons: [{ label: 'OK', primary: true, action: () => resolve(true) }] });
  });
}

function showConfirm(message, title = 'Konfirmasi', danger = false) {
  return new Promise(resolve => {
    bukaModal({
      icon: danger ? '🗑️' : '❓', title, message, type: 'confirm', danger,
      buttons: [
        { label: 'Batal', primary: false, action: () => resolve(false) },
        { label: 'Ya, Lanjutkan', primary: true, action: () => resolve(true) }
      ]
    });
  });
}

function showPrompt(message, defaultValue = '', title = 'Input Data') {
  return new Promise(resolve => {
    bukaModal({
      icon: '✏️', title, message, type: 'prompt', inputValue: defaultValue,
      buttons: [
        { label: 'Batal', primary: false, action: () => resolve(null) },
        { label: 'Simpan', primary: true, action: (val) => resolve(val) }
      ]
    });
  });
}

// =========================================================================
// ☁️ LOADER SINKRONISASI DATA DARI SUPABASE
// =========================================================================
async function muatKaryawanDariDB() {
  const { data, error } = await db.from('karyawan').select('*').order('created_at', { ascending: true });
  if (error) { console.error('Gagal memuat karyawan:', error.message); return; }
  DB_KARYAWAN_HR = data || [];
}

async function muatBarangDariDB() {
  const { data, error } = await db.from('barang').select('*').order('kode', { ascending: true });
  if (error) { console.error('Gagal memuat barang:', error.message); return; }
  // Mapping kolom 'descr' (DB) -> 'desc' (dipakai di UI)
  if (data && data.length) DB_BARANG = data.map(b => ({ ...b, desc: b.descr }));
}

async function muatPermintaanDariDB() {
  const { data, error } = await db.from('permintaan').select('*').order('created_at', { ascending: false });
  if (error) { console.error('Gagal memuat permintaan:', error.message); return; }
  // Mapping 'status_done' (DB) -> 'statusDone' (dipakai di UI)
  LIVE_ANTREAN_ADMIN = (data || []).map(o => ({ ...o, statusDone: o.status_done }));
}

async function muatTujuanDariDB() {
  const { data, error } = await db.from('tujuan').select('*').order('nama', { ascending: true });
  if (error) { console.error('Gagal memuat tujuan:', error.message); return; }
  DB_TUJUAN = data || [];
}

// Isi dropdown tujuan di loket mekanik dari DB_TUJUAN
function renderDropdownTujuan() {
  const sel = document.getElementById('cust-tujuan');
  if (!sel) return;
  if (!DB_TUJUAN.length) {
    sel.innerHTML = '<option value="">-- Belum ada tujuan (hubungi admin) --</option>';
    return;
  }
  sel.innerHTML = DB_TUJUAN.map(t => `<option value="${t.nama}">${t.nama}</option>`).join('');
}

// =========================================================================
// 🔐 GATE AUTENTIKASI AKSES KHUSUS (ADMIN & HR)
// =========================================================================
async function authLogin(peran) {
  if (peran === 'admin') {
    const pass = document.getElementById('pass-admin').value;
    if (pass === 'admin123') { // Ganti password admin gudang di sini
      document.getElementById('pass-admin').value = '';
      ubahTampilanLayar('scene-admin-menu');
    } else { await showAlert('Sandi Dashboard Gudang Salah!', 'Akses Ditolak', '⛔'); }
  }
  else if (peran === 'hr') {
    const pass = document.getElementById('pass-hr').value;
    if (pass === 'hr123') { // Ganti password HR personalia di sini
      document.getElementById('pass-hr').value = '';
      ubahTampilanLayar('scene-hr');
    } else { await showAlert('Sandi Otorisasi HR Salah!', 'Akses Ditolak', '⛔'); }
  }
}

// =========================================================================
// 👥 DASHBOARD INTERNAL HR: INPUT DATA KARYAWAN (HOOKS SUPABASE INCLUDED)
// =========================================================================
async function simpanKaryawanBaruHR() {
  const dataForm = {
    divisi: document.getElementById('hr-divisi').value,
    nama: document.getElementById('hr-nama').value.trim(),
    jk: document.getElementById('hr-jk').value,
    subdivisi: document.getElementById('hr-subdivisi').value.trim().toUpperCase(),
    pos: document.getElementById('hr-pos').value.trim().toUpperCase(),
    jabatan: document.getElementById('hr-jabatan').value.trim().toUpperCase(),
    shift: document.getElementById('hr-shift').value
  };

  if (EDIT_KARYAWAN_ID !== null) {
    // ---- MODE EDIT: perbarui record di Supabase ----
    const { error } = await db.from('karyawan').update(dataForm).eq('id', EDIT_KARYAWAN_ID);
    if (error) { await showAlert('Gagal memperbarui database: ' + error.message, 'Error', '⛔'); return; }
    tutupFormKaryawan();
    await muatKaryawanDariDB();
    renderTabelHR();
    await showAlert('Data Karyawan Berhasil Diperbarui!', 'Berhasil Diedit', '✅');
    return;
  }

  // ---- MODE TAMBAH BARU (tanpa 'id', Supabase generate otomatis) ----
  const { error } = await db.from('karyawan').insert([dataForm]);
  if (error) { await showAlert('Gagal menyimpan ke database: ' + error.message, 'Error', '⛔'); return; }

  tutupFormKaryawan();
  await muatKaryawanDariDB();
  renderTabelHR();
  await showAlert('Data Karyawan Berhasil Disimpan ke Database!', 'Berhasil', '✅');
}

function editKaryawanHR(id) {
  const emp = DB_KARYAWAN_HR.find(k => k.id === id);
  if (!emp) return;

  document.getElementById('hr-nama').value = emp.nama;
  document.getElementById('hr-divisi').value = emp.divisi;
  document.getElementById('hr-jk').value = emp.jk;
  document.getElementById('hr-subdivisi').value = emp.subdivisi;
  document.getElementById('hr-pos').value = emp.pos;
  document.getElementById('hr-jabatan').value = emp.jabatan;
  document.getElementById('hr-shift').value = emp.shift;

  EDIT_KARYAWAN_ID = id;
  document.getElementById('hr-form-avatar').textContent = '✏️';
  document.getElementById('hr-form-title').textContent = 'Edit Data Karyawan';
  document.getElementById('hr-form-subtitle').textContent = `Perbarui data ${emp.nama}`;
  document.getElementById('btn-simpan-hr').textContent = '💾 Perbarui Data';
  document.getElementById('hr-form-modal-overlay').classList.remove('hidden');
  document.getElementById('hr-nama').focus();
}

// =========================================================================
// 🔀 NAVIGASI DASHBOARD HR (Modal Tambah/Edit & Halaman Import)
// =========================================================================
function bukaFormKaryawan() {
  resetFormHR(); // mode tambah baru
  document.getElementById('hr-form-modal-overlay').classList.remove('hidden');
  document.getElementById('hr-nama').focus();
}

function tutupFormKaryawan() {
  document.getElementById('hr-form-modal-overlay').classList.add('hidden');
  resetFormHR();
}

function bukaHalamanImport() {
  document.getElementById('hr-view-list').classList.add('hidden');
  document.getElementById('hr-view-import').classList.remove('hidden');
}

function kembaliKeListHR() {
  document.getElementById('hr-view-import').classList.add('hidden');
  document.getElementById('hr-view-list').classList.remove('hidden');
  renderTabelHR();
}

// =========================================================================
// 📥 IMPORT DATA KARYAWAN DARI EXCEL (SheetJS)
// =========================================================================
let HR_IMPORT_BUFFER = [];

function handleFileExcelHR(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;
  document.getElementById('hr-import-filename').textContent = '📎 ' + file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      HR_IMPORT_BUFFER = rows.map(normalisasiBarisImport).filter(r => r.nama);
      tampilkanPreviewImport();
    } catch (err) {
      showAlert('Gagal membaca file Excel: ' + err.message, 'Error Import', '⛔');
    }
  };
  reader.readAsArrayBuffer(file);
}

// Ambil nilai kolom secara fleksibel (abaikan besar/kecil huruf & spasi)
function normalisasiBarisImport(row) {
  const get = (...keys) => {
    for (const k of Object.keys(row)) {
      const norm = k.toLowerCase().replace(/[^a-z]/g, '');
      if (keys.includes(norm)) return String(row[k]).trim();
    }
    return '';
  };
  return {
    divisi: get('divisi').toUpperCase(),
    nama: get('nama', 'namakaryawan'),
    jk: get('jk', 'jeniskelamin').toUpperCase().charAt(0),
    subdivisi: get('subdivisi', 'subdiv').toUpperCase(),
    pos: get('pos').toUpperCase(),
    jabatan: get('jabatan').toUpperCase(),
    shift: get('shift').toUpperCase()
  };
}

// Tandai baris duplikat: nama sudah ada di DB, atau dobel di dalam file
function tandaiDuplikatImport() {
  const namaDB = new Set(DB_KARYAWAN_HR.map(k => k.nama.trim().toLowerCase()));
  const terlihat = new Set();

  HR_IMPORT_BUFFER.forEach(r => {
    const key = r.nama.trim().toLowerCase();
    if (namaDB.has(key)) { r._dup = true; r._reason = 'Sudah ada di database'; }
    else if (terlihat.has(key)) { r._dup = true; r._reason = 'Dobel di dalam file'; }
    else { r._dup = false; r._reason = ''; }
    terlihat.add(key);
  });
}

function tampilkanPreviewImport() {
  const preview = document.getElementById('hr-import-preview');
  const btn = document.getElementById('btn-proses-import');

  if (!HR_IMPORT_BUFFER.length) {
    preview.innerHTML = '<div class="empty-text">Tidak ada baris valid (kolom NAMA kosong). Pastikan header sesuai template.</div>';
    btn.classList.add('hidden');
    return;
  }

  tandaiDuplikatImport();
  const jmlDup = HR_IMPORT_BUFFER.filter(r => r._dup).length;
  const jmlValid = HR_IMPORT_BUFFER.length - jmlDup;

  const rowsHtml = HR_IMPORT_BUFFER.slice(0, 100).map((r, i) => `
    <tr class="${r._dup ? 'row-dup' : ''}">
      <td>${i + 1}</td><td>${r.divisi}</td><td>${r.nama}</td><td>${r.jk}</td><td>${r.subdivisi}</td><td>${r.pos}</td><td>${r.jabatan}</td><td>${r.shift}</td>
      <td>${r._dup ? `⚠️ ${r._reason}` : '✅ OK'}</td>
    </tr>
  `).join('');

  const dupNote = jmlDup > 0
    ? `<div class="hr-import-dup-note">⚠️ ${jmlDup} baris duplikat akan dilewati (ditandai merah). Hanya ${jmlValid} baris valid yang disimpan.</div>`
    : '';

  preview.innerHTML = `
    <div class="hr-import-count">✅ ${jmlValid} baris valid${jmlDup ? ` · ⚠️ ${jmlDup} duplikat` : ''} ${HR_IMPORT_BUFFER.length > 100 ? '(preview 100 pertama)' : ''}</div>
    ${dupNote}
    <div class="hr-preview-scroll">
      <table class="table-preview-import">
        <thead><tr><th>#</th><th>DIVISI</th><th>NAMA</th><th>JK</th><th>SUBDIV</th><th>POS</th><th>JABATAN</th><th>SHIFT</th><th>STATUS</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  // Tombol simpan hanya aktif kalau ada baris valid
  btn.classList.toggle('hidden', jmlValid === 0);
}

async function prosesImportKaryawanHR() {
  if (!HR_IMPORT_BUFFER.length) return;

  tandaiDuplikatImport();
  // Ambil hanya baris valid & buang properti bantu (_dup/_reason)
  const dataValid = HR_IMPORT_BUFFER.filter(r => !r._dup).map(({ _dup, _reason, ...rest }) => rest);
  const jmlDup = HR_IMPORT_BUFFER.length - dataValid.length;

  if (!dataValid.length) {
    await showAlert('Semua baris duplikat — tidak ada data baru untuk disimpan.', 'Import Dibatalkan', '⚠️');
    return;
  }

  const { error } = await db.from('karyawan').insert(dataValid);
  if (error) { await showAlert('Gagal import ke database: ' + error.message, 'Error', '⛔'); return; }

  const jml = dataValid.length;
  HR_IMPORT_BUFFER = [];
  document.getElementById('hr-file-excel').value = '';
  document.getElementById('hr-import-filename').textContent = '';
  document.getElementById('hr-import-preview').innerHTML = '';
  document.getElementById('btn-proses-import').classList.add('hidden');

  await muatKaryawanDariDB();
  const pesan = jmlDup > 0
    ? `${jml} data berhasil diimport. ${jmlDup} baris duplikat dilewati.`
    : `${jml} data karyawan berhasil diimport ke database!`;
  await showAlert(pesan, 'Import Berhasil', '✅');
  kembaliKeListHR();
}

function unduhTemplateExcelHR() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['DIVISI', 'NAMA', 'JK', 'SUBDIVISI', 'POS', 'JABATAN', 'SHIFT'],
    ['UMUM', 'Contoh Nama', 'L', 'ADMIN', 'ADMIN', 'STAFF', 'NS']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Karyawan');
  XLSX.writeFile(wb, 'template_import_karyawan.xlsx');
}

function resetFormHR() {
  document.getElementById('hr-employee-form').reset();
  EDIT_KARYAWAN_ID = null;
  document.getElementById('hr-form-avatar').textContent = '➕';
  document.getElementById('hr-form-title').textContent = 'Tambah Karyawan';
  document.getElementById('hr-form-subtitle').textContent = 'Lengkapi data karyawan baru di bawah ini';
  document.getElementById('btn-simpan-hr').textContent = '💾 Simpan';
}

function renderTabelHR() {
  const tbody = document.getElementById('hr-table-body-target');
  const searchKey = document.getElementById('hr-search-box').value.toLowerCase().trim();

  // Filter pencarian di dashboard HR
  let filtered = DB_KARYAWAN_HR.filter(k => 
    k.nama.toLowerCase().includes(searchKey) || 
    k.divisi.toLowerCase().includes(searchKey) ||
    k.subdivisi.toLowerCase().includes(searchKey)
  );

  // Update badge jumlah karyawan
  const badge = document.getElementById('hr-count-badge');
  if (badge) badge.textContent = DB_KARYAWAN_HR.length;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#888780; font-style:italic;">Belum ada record data karyawan terdaftar...</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((k, index) => `
    <tr>
      <td style="text-align:center; color:#888780; font-weight:600">${index + 1}</td>
      <td><b>${k.divisi}</b></td>
      <td>${k.nama}</td>
      <td style="text-align:center">${k.jk}</td>
      <td>${k.subdivisi}</td>
      <td>${k.pos}</td>
      <td>${k.jabatan}</td>
      <td style="text-align:center"><span class="active-user-tag" style="background:#f0efea; color:#1a1a18;">${k.shift}</span></td>
      <td>
        <div class="hr-aksi-cell">
          <button type="button" class="btn btn-edit-hr" onclick="editKaryawanHR(${k.id})">✏️ Edit</button>
          <button type="button" class="btn btn-del-hr" onclick="hapusKaryawanHR(${k.id})">🗑️ Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function hapusKaryawanHR(id) {
  const ok = await showConfirm('Apakah Anda yakin ingin menghapus data record karyawan ini?', 'Hapus Data Karyawan', true);
  if (!ok) return;

  const { error } = await db.from('karyawan').delete().eq('id', id);
  if (error) { await showAlert('Gagal menghapus dari database: ' + error.message, 'Error', '⛔'); return; }

  if (EDIT_KARYAWAN_ID === id) resetFormHR();
  await muatKaryawanDariDB();
  renderTabelHR();
}

// =========================================================================
// 🛒 LOKET MANDIRI CUSTOMER / MEKANIK (DENGAN INTEGRASI DROPDOWN VALIDASI HR)
// =========================================================================
async function bukaLayarCustomer() {
  DATA_KERANJANG = [];
  document.getElementById('cust-step-katalog').classList.add('hidden');
  document.getElementById('cust-step-identitas').classList.remove('hidden');

  // Sinkronkan data karyawan, barang, & tujuan terbaru dari Supabase
  await Promise.all([muatKaryawanDariDB(), muatBarangDariDB(), muatTujuanDariDB()]);
  renderDropdownTujuan();

  // Reset input nama & saran; data karyawan sudah tersinkron di DB_KARYAWAN_HR
  document.getElementById('cust-karyawan-input').value = '';
  document.getElementById('cust-lbl-divisi').value = '';
  document.getElementById('cust-nama-suggestions').classList.add('hidden');

  ubahTampilanLayar('scene-customer');
  renderKatalogMekanik(DB_BARANG);
  renderKeranjangMekanik();
}

function cariKaryawanByNama() {
  const nama = document.getElementById('cust-karyawan-input').value.trim().toLowerCase();
  if (!nama) return null;
  return DB_KARYAWAN_HR.find(x => x.nama.toLowerCase() === nama) || null;
}

// Tampilkan saran nama yang mirip dengan ketikan
function filterSaranNama(keyword) {
  const box = document.getElementById('cust-nama-suggestions');
  const q = keyword.trim().toLowerCase();

  // Isi otomatis kolom divisi bila nama cocok persis
  autoFillDataMekanik();

  if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }

  const cocok = DB_KARYAWAN_HR
    .filter(k => k.nama.toLowerCase().includes(q))
    .slice(0, 8);

  if (!cocok.length) {
    box.innerHTML = '<div class="autocomplete-empty">Nama tidak ditemukan...</div>';
    box.classList.remove('hidden');
    return;
  }

  box.innerHTML = cocok.map(k => `
    <div class="autocomplete-item" onclick="pilihNamaKaryawan(${k.id})">
      <span class="ac-nama">${k.nama}</span>
      <span class="ac-meta">${k.divisi} · ${k.pos}</span>
    </div>
  `).join('');
  box.classList.remove('hidden');
}

function pilihNamaKaryawan(id) {
  const emp = DB_KARYAWAN_HR.find(k => k.id === id);
  if (!emp) return;
  document.getElementById('cust-karyawan-input').value = emp.nama;
  document.getElementById('cust-nama-suggestions').classList.add('hidden');
  autoFillDataMekanik();
}

function autoFillDataMekanik() {
  const targetInputDivisi = document.getElementById('cust-lbl-divisi');
  const emp = cariKaryawanByNama();

  if (!emp) { targetInputDivisi.value = ''; return; }
  targetInputDivisi.value = `${emp.divisi} / ${emp.subdivisi} [${emp.pos}]`;
}

async function kunciIdentitasMekanik() {
  const emp = cariKaryawanByNama();
  if (!emp) { await showAlert('Nama tidak ditemukan. Ketik & pilih nama Anda dari daftar karyawan terdaftar!', 'Data Belum Valid', '⚠️'); return; }

  sessionUser = { nama: emp.nama, dept: `${emp.divisi} (${emp.subdivisi})`, keperluan: document.getElementById('cust-tujuan').value };
  
  document.getElementById('label-mekanik-aktif').textContent = `${emp.nama} - ${emp.pos}`;
  document.getElementById('cust-step-identitas').classList.add('hidden');
  document.getElementById('cust-step-katalog').classList.remove('hidden');
}

function revisiIdentitasMekanik() {
  document.getElementById('cust-step-katalog').classList.add('hidden');
  document.getElementById('cust-step-identitas').classList.remove('hidden');
}

function renderKatalogMekanik(list) {
  const container = document.getElementById('katalog-container');
  container.innerHTML = list.map(b => `
    <div class="card">
      <div>
        <div class="card-nama">${b.nama}</div>
        <div class="card-img">
          ${b.gambar
            ? `<img src="${b.gambar}" alt="${b.nama}" onerror="this.parentNode.classList.add('no-img'); this.remove();">`
            : '<span class="card-img-placeholder">📦</span>'}
        </div>
        <div class="card-meta">📍 Rak ${b.lokasi} · <span class="stok-ok">Stok: ${b.stok}</span></div>
        <div style="font-size:11px; color:#666; line-height:1.2">${b.desc}</div>
      </div>
      <div class="card-bottom">
        <button class="btn" style="background:#1a1a18; color:#fff; padding:4px 8px; font-size:11px" onclick="tambahKeKeranjangMekanik('${b.kode}')">+ Pilih</button>
      </div>
    </div>
  `).join('');
}

function filterKatalogMekanik(key) {
  const q = key.toLowerCase();
  const filtered = DB_BARANG.filter(b => b.nama.toLowerCase().includes(q) || b.kode.toLowerCase().includes(q) || (b.alias || '').toLowerCase().includes(q));
  renderKatalogMekanik(filtered);
}

// =========================================================================
// 📦 KATALOG BARANG (DASHBOARD ADMIN) — daftar + kelola
// =========================================================================
function renderKatalogAdmin() {
  const container = document.getElementById('katalog-admin-container');
  if (!container) return;
  const q = (document.getElementById('katalog-admin-search').value || '').toLowerCase();

  const list = DB_BARANG.filter(b =>
    b.nama.toLowerCase().includes(q) ||
    b.kode.toLowerCase().includes(q) ||
    (b.alias || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    container.innerHTML = '<div class="empty-text">Belum ada barang di katalog. Klik "➕ Tambah Barang".</div>';
    return;
  }

  container.innerHTML = list.map(b => `
    <div class="card">
      <div>
        <div class="card-nama">${b.nama}</div>
        <div class="card-img">
          ${b.gambar
            ? `<img src="${b.gambar}" alt="${b.nama}" onerror="this.parentNode.classList.add('no-img'); this.remove();">`
            : '<span class="card-img-placeholder">📦</span>'}
        </div>
        <div class="card-meta">🔖 ${b.kode} · 📍 Rak ${b.lokasi} · <span class="stok-ok">Stok: ${b.stok} ${b.satuan}</span></div>
        <div style="font-size:11px; color:#666; line-height:1.2">${b.desc || ''}</div>
      </div>
      <div class="card-bottom" style="display:flex; gap:6px; margin-top:8px;">
        <button type="button" class="btn btn-edit-hr" style="flex:1" onclick="editBarang('${b.kode}')">✏️ Edit</button>
        <button type="button" class="btn btn-del-hr" style="flex:1" onclick="hapusBarang('${b.kode}')">🗑️ Hapus</button>
      </div>
    </div>
  `).join('');
}

async function hapusBarang(kode) {
  const ok = await showConfirm(`Hapus barang "${kode}" dari katalog?`, 'Hapus Barang', true);
  if (!ok) return;

  const { error } = await db.from('barang').delete().eq('kode', kode);
  if (error) { await showAlert('Gagal menghapus barang: ' + error.message, 'Error', '⛔'); return; }

  await muatBarangDariDB();
  renderKatalogAdmin();
}

// =========================================================================
// ➕ TAMBAH / EDIT BARANG (dengan upload gambar dari file → Supabase)
// =========================================================================
let BARANG_GAMBAR_BASE64 = ''; // menyimpan gambar terpilih sebagai data URL
let EDIT_BARANG_KODE = null;   // null = tambah baru, terisi = mode edit

function bukaFormBarang() {
  document.getElementById('barang-form').reset();
  hapusGambarBarang();
  EDIT_BARANG_KODE = null;
  document.getElementById('barang-form-title').textContent = 'Tambah Barang';
  document.getElementById('btn-simpan-barang').textContent = '💾 Simpan Barang';
  document.getElementById('barang-kode').disabled = false;
  document.getElementById('barang-modal-overlay').classList.remove('hidden');
  document.getElementById('barang-kode').focus();
}

function editBarang(kode) {
  const b = DB_BARANG.find(x => x.kode === kode);
  if (!b) return;

  document.getElementById('barang-kode').value = b.kode;
  document.getElementById('barang-nama').value = b.nama;
  document.getElementById('barang-alias').value = b.alias || '';
  document.getElementById('barang-lokasi').value = b.lokasi || '';
  document.getElementById('barang-stok').value = b.stok;
  document.getElementById('barang-satuan').value = b.satuan || '';
  document.getElementById('barang-desc').value = b.desc || '';

  // Muat gambar lama ke preview
  BARANG_GAMBAR_BASE64 = b.gambar || '';
  if (b.gambar) {
    document.getElementById('barang-img-preview').innerHTML = `<img src="${b.gambar}" alt="preview">`;
    document.getElementById('btn-hapus-gambar').style.display = 'block';
  } else {
    document.getElementById('barang-img-preview').innerHTML = '<span class="card-img-placeholder">📦</span>';
    document.getElementById('btn-hapus-gambar').style.display = 'none';
  }

  EDIT_BARANG_KODE = kode;
  document.getElementById('barang-form-title').textContent = 'Edit Barang';
  document.getElementById('btn-simpan-barang').textContent = '💾 Perbarui Barang';
  document.getElementById('barang-kode').disabled = true; // kode tidak boleh diubah (primary key)
  document.getElementById('barang-modal-overlay').classList.remove('hidden');
}

function tutupFormBarang() {
  document.getElementById('barang-modal-overlay').classList.add('hidden');
  document.getElementById('barang-kode').disabled = false;
}

function handleGambarBarang(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;

  // Batasi ukuran agar tidak terlalu besar disimpan di database (maks ~1.5MB)
  if (file.size > 1.5 * 1024 * 1024) {
    showAlert('Ukuran gambar terlalu besar (maks 1.5 MB). Pilih gambar lebih kecil.', 'Gambar Terlalu Besar', '⚠️');
    inputEl.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    BARANG_GAMBAR_BASE64 = e.target.result;
    document.getElementById('barang-img-preview').innerHTML = `<img src="${BARANG_GAMBAR_BASE64}" alt="preview">`;
    document.getElementById('btn-hapus-gambar').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function hapusGambarBarang() {
  BARANG_GAMBAR_BASE64 = '';
  document.getElementById('barang-file-gambar').value = '';
  document.getElementById('barang-img-preview').innerHTML = '<span class="card-img-placeholder">📦</span>';
  document.getElementById('btn-hapus-gambar').style.display = 'none';
}

async function simpanBarangBaru() {
  const dataBarang = {
    kode: document.getElementById('barang-kode').value.trim().toUpperCase(),
    nama: document.getElementById('barang-nama').value.trim(),
    alias: document.getElementById('barang-alias').value.trim().toLowerCase(),
    lokasi: document.getElementById('barang-lokasi').value.trim().toUpperCase(),
    stok: parseInt(document.getElementById('barang-stok').value) || 0,
    satuan: document.getElementById('barang-satuan').value.trim(),
    descr: document.getElementById('barang-desc').value.trim(),  // kolom DB: 'descr'
    gambar: BARANG_GAMBAR_BASE64 || null
  };

  if (EDIT_BARANG_KODE !== null) {
    // ---- MODE EDIT ---- (kode tidak diubah)
    const { error } = await db.from('barang').update(dataBarang).eq('kode', EDIT_BARANG_KODE);
    if (error) { await showAlert('Gagal memperbarui barang: ' + error.message, 'Error', '⛔'); return; }
    tutupFormBarang();
    await muatBarangDariDB();
    renderKatalogAdmin();
    await showAlert('Data barang berhasil diperbarui!', 'Berhasil', '✅');
    return;
  }

  // ---- MODE TAMBAH ---- cegah kode duplikat
  if (DB_BARANG.some(b => b.kode === dataBarang.kode)) {
    await showAlert('Kode barang sudah dipakai. Gunakan kode lain.', 'Duplikat', '⚠️');
    return;
  }

  const { error } = await db.from('barang').insert([dataBarang]);
  if (error) { await showAlert('Gagal menyimpan barang: ' + error.message, 'Error', '⛔'); return; }

  tutupFormBarang();
  await muatBarangDariDB();
  renderKatalogAdmin();
  await showAlert('Barang baru berhasil ditambahkan ke katalog!', 'Berhasil', '✅');
}

function tambahKeKeranjangMekanik(kode) {
  const masterItem = DB_BARANG.find(x => x.kode === kode);
  const ada = DATA_KERANJANG.find(x => x.kode === kode);
  if (ada) { if (ada.qty < masterItem.stok) ada.qty++; } else { DATA_KERANJANG.push({ ...masterItem, qty: 1 }); }
  renderKeranjangMekanik();
}

function ubahQtyMekanik(index, delta) {
  DATA_KERANJANG[index].qty += delta;
  if (DATA_KERANJANG[index].qty <= 0) DATA_KERANJANG.splice(index, 1);
  renderKeranjangMekanik();
}

function renderKeranjangMekanik() {
  const container = document.getElementById('cart-container');
  document.getElementById('btn-print-mekanik').disabled = DATA_KERANJANG.length === 0;

  if (!DATA_KERANJANG.length) {
    container.innerHTML = '<div class="empty-text">Keranjang masih kosong.</div>';
    return;
  }
  container.innerHTML = DATA_KERANJANG.map((item, i) => `
    <div class="cart-item">
      <div><b>${item.nama}</b><br><span style="color:#888780; font-size:11px">Rak: ${item.lokasi}</span></div>
      <div class="qty-control">
        <button class="btn-qty" onclick="ubahQtyMekanik(${i}, -1)">-</button>
        <span><b>${item.qty}</b> ${item.satuan}</span>
        <button class="btn-qty" onclick="ubahQtyMekanik(${i}, 1)">+</button>
      </div>
    </div>
  `).join('');
}

async function prosesCetakDanKirimMekanik() {
  const now = new Date();
  const orderPaket = {
    nama: sessionUser.nama,
    dept: sessionUser.dept,
    keperluan: sessionUser.keperluan,
    waktu: now.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'}),
    tanggal: now.toISOString().split('T')[0],
    items: JSON.parse(JSON.stringify(DATA_KERANJANG)),
    status_done: false
  };

  // Kirim ke antrean admin (tabel permintaan di Supabase)
  const { error } = await db.from('permintaan').insert([orderPaket]);
  if (error) { await showAlert('Gagal mengirim permintaan ke database: ' + error.message, 'Error', '⛔'); return; }

  // Generate cetak nota loket
  const nodePrint = document.getElementById('struk-print');
  nodePrint.innerHTML = `
    <center><b>STRUK PERMINTAAN GUDANG</b><br>Serahkan ke Jendela Loket</center>
    <br>
    Nama   : ${orderPaket.nama}<br>Divisi : ${orderPaket.dept}<br>Waktu  : ${orderPaket.tanggal} ${orderPaket.waktu}<br>
    --------------------------<br>
    ${orderPaket.items.map(i => `${i.nama}<br>Qty: ${i.qty} ${i.satuan} [Rak:${i.lokasi}]<br>`).join('<br>')}
    --------------------------<br>
    <center>Silakan ambil kertas struk Anda.</center>
  `;

  // Voice engine high-speed (rate = 1.45)
  if ('speechSynthesis' in window) {
    let teksPanggil = `Pesanan baru dari ${orderPaket.nama}, divisi ${orderPaket.dept}. `;
    orderPaket.items.forEach(i => { teksPanggil += `Ambil ${i.nama}, ${i.qty} ${i.satuan}, di rak ${i.lokasi}. `; });
    const utterance = new SpeechSynthesisUtterance(teksPanggil);
    utterance.lang = 'id-ID'; utterance.rate = 1.45;
    window.speechSynthesis.speak(utterance);
  }

  window.print();
  await showAlert('Struk permintaan dicetak!', 'Berhasil', '🖨️');
  keluarKePortal();
}

// =========================================================================
// 🖥️ DASHBOARD INTERNAL ADMIN GUDANG: WORKSPACE VERIFIKASI & RETUR
// =========================================================================
function renderWorkspaceAdmin() {
  const containerLive = document.getElementById('admin-live-orders');
  const containerHistory = document.getElementById('admin-history-done');

  const searchKey = document.getElementById('admin-search-input').value.toLowerCase().trim();
  const dateKey = document.getElementById('admin-date-filter').value;

  let filtered = LIVE_ANTREAN_ADMIN.filter(o => {
    if (dateKey && o.tanggal !== dateKey) return false;
    if (searchKey) {
      const matchUser = o.nama.toLowerCase().includes(searchKey) || o.dept.toLowerCase().includes(searchKey);
      const matchBarang = o.items.some(i => i.nama.toLowerCase().includes(searchKey) || i.lokasi.toLowerCase().includes(searchKey));
      return matchUser || matchBarang;
    }
    return true;
  });

  const dataBelumSiap = filtered.filter(o => !o.statusDone);
  const dataSelesai = filtered.filter(o => o.statusDone);

  // Render Antrean Berjalan (Sisi Kiri)
  if (!dataBelumSiap.length) {
    containerLive.innerHTML = '<div class="empty-text">Tidak ada antrean live saat ini...</div>';
  } else {
    containerLive.innerHTML = dataBelumSiap.map(o => `
      <div class="order-card">
        <div class="order-card-header"><span>👤 ${o.nama}</span><span>🕒 ${o.waktu}</span></div>
        <div style="font-size:11px; color:#5f5e5a; margin-bottom:5px">Divisi: ${o.dept}</div>
        <div>
          ${o.items.map(i => `<div class="order-row"><span>📦 ${i.nama} x <b>${i.qty}</b></span><span style="color:#0f6e56; font-weight:600">📍 Rak ${i.lokasi}</span></div>`).join('')}
        </div>
        <div class="admin-action-bar">
          <button class="btn btn-edit" onclick="revisiPesananOlehAdmin(${o.id})">✏️ Revisi Item</button>
          <button class="btn btn-confirm" onclick="pindahkanKeHistorySelesai(${o.id})">✅ Selesai</button>
        </div>
      </div>
    `).join('');
  }

  // Render History Done (Sisi Kanan)
  if (!dataSelesai.length) {
    containerHistory.innerHTML = '<div class="empty-text">Belum ada penyelesaian hari ini.</div>';
  } else {
    containerHistory.innerHTML = dataSelesai.map(o => `
      <div class="history-card-done">
        <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>✅ ${o.nama}</span><span>📅 ${o.tanggal}</span></div>
        <div style="color:#5f5e5a; font-size:11px; margin-top:4px">Fisik: ${o.items.map(i => `${i.nama} (${i.qty})`).join(', ')}</div>
        <div style="text-align: right;"><button class="btn btn-return" onclick="returKeLiveAntrean(${o.id})">↩️ Tukar Barang / Retur Balik</button></div>
      </div>
    `).join('');
  }
}

// =========================================================================
// ✏️ REVISI PESANAN (ganti barang / ubah qty / hapus item)
// =========================================================================
let REVISI_ORDER_ID = null;
let REVISI_ITEMS = []; // salinan kerja item pesanan

async function revisiPesananOlehAdmin(orderId) {
  const orderTarget = LIVE_ANTREAN_ADMIN.find(x => x.id === orderId);
  if (!orderTarget) return;

  await muatBarangDariDB(); // pastikan katalog terbaru untuk pilihan ganti barang

  REVISI_ORDER_ID = orderId;
  REVISI_ITEMS = JSON.parse(JSON.stringify(orderTarget.items)); // salin agar bisa dibatalkan
  document.getElementById('revisi-subtitle').textContent = `Pesanan ${orderTarget.nama} — ganti barang atau ubah jumlah`;
  renderRevisiRows();
  document.getElementById('revisi-modal-overlay').classList.remove('hidden');
}

function renderRevisiRows() {
  const box = document.getElementById('revisi-items-container');
  if (!REVISI_ITEMS.length) {
    box.innerHTML = '<div class="empty-text">Tidak ada item. Tambahkan barang di bawah.</div>';
    return;
  }

  box.innerHTML = REVISI_ITEMS.map((it, i) => `
    <div class="revisi-row">
      <div class="revisi-nama-wrap">
        <input type="text" class="revisi-nama-input" id="revisi-input-${i}" value="${it.nama || ''}"
               placeholder="Ketik nama / kode barang..." autocomplete="off"
               oninput="filterSaranBarangRevisi(${i}, this.value)"
               onfocus="filterSaranBarangRevisi(${i}, this.value)">
        <div class="autocomplete-box hidden" id="revisi-sugg-${i}"></div>
      </div>
      <input type="number" class="revisi-qty" min="0" value="${it.qty}" onchange="ubahQtyRevisi(${i}, this.value)">
      <button type="button" class="btn btn-del-hr" onclick="hapusItemRevisi(${i})">🗑️</button>
    </div>
  `).join('');
}

function filterSaranBarangRevisi(index, keyword) {
  const box = document.getElementById('revisi-sugg-' + index);
  const q = keyword.trim().toLowerCase();
  if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }

  const cocok = DB_BARANG.filter(b =>
    b.nama.toLowerCase().includes(q) ||
    b.kode.toLowerCase().includes(q) ||
    (b.alias || '').toLowerCase().includes(q)
  ).slice(0, 8);

  if (!cocok.length) {
    box.innerHTML = '<div class="autocomplete-empty">Barang tidak ditemukan...</div>';
    box.classList.remove('hidden');
    return;
  }

  box.innerHTML = cocok.map(b => `
    <div class="autocomplete-item" onclick="pilihBarangRevisi(${index}, '${b.kode}')">
      <span class="ac-nama">${b.nama}</span>
      <span class="ac-meta">${b.kode} · Rak ${b.lokasi} · Stok ${b.stok}</span>
    </div>
  `).join('');
  box.classList.remove('hidden');
}

function pilihBarangRevisi(index, kode) {
  const b = DB_BARANG.find(x => x.kode === kode);
  if (!b) return;
  const qtyLama = REVISI_ITEMS[index].qty || 1;
  REVISI_ITEMS[index] = { kode: b.kode, nama: b.nama, lokasi: b.lokasi, satuan: b.satuan, qty: qtyLama };
  document.getElementById('revisi-input-' + index).value = b.nama;
  document.getElementById('revisi-sugg-' + index).classList.add('hidden');
}

function ubahQtyRevisi(index, val) {
  REVISI_ITEMS[index].qty = parseInt(val) || 0;
}

function hapusItemRevisi(index) {
  REVISI_ITEMS.splice(index, 1);
  renderRevisiRows();
}

function tambahBarisRevisi() {
  REVISI_ITEMS.push({ kode: '', nama: '', lokasi: '', satuan: '', qty: 1 });
  renderRevisiRows();
}

function tutupRevisi() {
  document.getElementById('revisi-modal-overlay').classList.add('hidden');
  REVISI_ORDER_ID = null;
  REVISI_ITEMS = [];
}

async function simpanRevisi() {
  const itemsFinal = REVISI_ITEMS.filter(i => i.kode && i.qty > 0);
  if (!itemsFinal.length) {
    await showAlert('Minimal harus ada 1 barang yang dipilih dengan jumlah lebih dari 0.', 'Data Kosong', '⚠️');
    return;
  }

  const { error } = await db.from('permintaan').update({ items: itemsFinal }).eq('id', REVISI_ORDER_ID);
  if (error) { await showAlert('Gagal menyimpan revisi: ' + error.message, 'Error', '⛔'); return; }

  tutupRevisi();
  await muatPermintaanDariDB();
  renderWorkspaceAdmin();
  await showAlert('Revisi pesanan berhasil disimpan!', 'Berhasil', '✅');
}

async function pindahkanKeHistorySelesai(orderId) {
  const { error } = await db.from('permintaan').update({ status_done: true }).eq('id', orderId);
  if (error) { await showAlert('Gagal memperbarui status: ' + error.message, 'Error', '⛔'); return; }

  await muatPermintaanDariDB();
  renderWorkspaceAdmin();
}

async function returKeLiveAntrean(orderId) {
  const orderTarget = LIVE_ANTREAN_ADMIN.find(x => x.id === orderId);
  const ok = await showConfirm(`Kembalikan pesanan ${orderTarget.nama} ke antrean live untuk penukaran barang?`, 'Konfirmasi Retur');
  if (!ok) return;

  const { error } = await db.from('permintaan').update({ status_done: false }).eq('id', orderId);
  if (error) { await showAlert('Gagal retur: ' + error.message, 'Error', '⛔'); return; }

  await muatPermintaanDariDB();
  renderWorkspaceAdmin();
}

function resetFilterAdmin() {
  document.getElementById('admin-search-input').value = '';
  document.getElementById('admin-date-filter').value = '';
  renderWorkspaceAdmin();
}

// =========================================================================
// 🎯 KELOLA TUJUAN KEPERLUAN (ADMIN → tersimpan di Supabase)
// =========================================================================
let EDIT_TUJUAN_ID = null; // null = mode tambah, terisi = mode edit

async function bukaKelolaTujuan() {
  document.getElementById('tujuan-modal-overlay').classList.remove('hidden');
  resetFormTujuan();
  await muatTujuanDariDB();
  renderTujuanList();
}

function tutupKelolaTujuan() {
  document.getElementById('tujuan-modal-overlay').classList.add('hidden');
  resetFormTujuan();
}

function renderTujuanList() {
  const box = document.getElementById('tujuan-list');
  if (!DB_TUJUAN.length) {
    box.innerHTML = '<div class="empty-text">Belum ada tujuan. Tambahkan di atas.</div>';
    return;
  }
  box.innerHTML = DB_TUJUAN.map(t => `
    <div class="tujuan-item">
      <span>🎯 ${t.nama}</span>
      <div class="tujuan-item-actions">
        <button type="button" class="btn btn-edit-hr" onclick="editTujuan(${t.id})">✏️ Edit</button>
        <button type="button" class="btn btn-del-hr" onclick="hapusTujuan(${t.id})">🗑️ Hapus</button>
      </div>
    </div>
  `).join('');
}

function editTujuan(id) {
  const t = DB_TUJUAN.find(x => x.id === id);
  if (!t) return;
  EDIT_TUJUAN_ID = id;
  document.getElementById('tujuan-input').value = t.nama;
  document.getElementById('btn-tujuan-submit').textContent = 'Perbarui';
  document.getElementById('btn-tujuan-batal').classList.remove('hidden');
  document.getElementById('tujuan-input').focus();
}

function batalEditTujuan() {
  resetFormTujuan();
}

function resetFormTujuan() {
  EDIT_TUJUAN_ID = null;
  document.getElementById('tujuan-input').value = '';
  document.getElementById('btn-tujuan-submit').textContent = 'Tambah';
  document.getElementById('btn-tujuan-batal').classList.add('hidden');
}

async function tambahTujuan() {
  const input = document.getElementById('tujuan-input');
  const nama = input.value.trim();
  if (!nama) return;

  // Cegah duplikat (case-insensitive), abaikan record yang sedang diedit
  if (DB_TUJUAN.some(t => t.nama.toLowerCase() === nama.toLowerCase() && t.id !== EDIT_TUJUAN_ID)) {
    await showAlert('Tujuan tersebut sudah ada di daftar.', 'Duplikat', '⚠️');
    return;
  }

  if (EDIT_TUJUAN_ID !== null) {
    // ---- MODE EDIT ----
    const { error } = await db.from('tujuan').update({ nama }).eq('id', EDIT_TUJUAN_ID);
    if (error) { await showAlert('Gagal memperbarui tujuan: ' + error.message, 'Error', '⛔'); return; }
  } else {
    // ---- MODE TAMBAH ----
    const { error } = await db.from('tujuan').insert([{ nama }]);
    if (error) { await showAlert('Gagal menambah tujuan: ' + error.message, 'Error', '⛔'); return; }
  }

  resetFormTujuan();
  await muatTujuanDariDB();
  renderTujuanList();
}

async function hapusTujuan(id) {
  const ok = await showConfirm('Hapus tujuan keperluan ini dari daftar?', 'Hapus Tujuan', true);
  if (!ok) return;

  const { error } = await db.from('tujuan').delete().eq('id', id);
  if (error) { await showAlert('Gagal menghapus: ' + error.message, 'Error', '⛔'); return; }

  if (EDIT_TUJUAN_ID === id) resetFormTujuan();
  await muatTujuanDariDB();
  renderTujuanList();
}

// BOOTSTRAP INIT RUNTIME
async function initApp() {
  await muatBarangDariDB(); // tarik master barang dari Supabase (fallback ke data statis bila gagal)
  ubahTampilanLayar('scene-portal');
}
initApp();