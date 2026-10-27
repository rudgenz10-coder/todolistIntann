/**
 * appcontroller.js
 * Logika aplikasi (state & aksi) berbasis Alpine.js.
 * Bergantung pada window.TaskDB dari database.js.
 */

// ---------- Helper tanggal (zona waktu lokal, format YYYY-MM-DD) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`; // m = 0-11
const todayISO = () => {
  const n = new Date();
  return toISO(n.getFullYear(), n.getMonth(), n.getDate());
};
const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function todoApp() {
  const now = new Date();

  return {
    // ---------- State ----------
    tasks: [],
    form: { title: '', priority: 'medium', category: '', date: todayISO(), time: '', notes: '', repeat: 'none', subtasks: [], newSubtask: '' },
    dragTaskId: null,
    dragOverDate: null,
    editingId: null,
    error: '',
    filter: 'all', // all | active | completed
    quick: 'all', // all | today | overdue  (dari kartu Agenda)
    categoryFilter: '',
    search: '',
    toasts: [],

    // Tema, menu, pengingat, log tugas selesai
    dark: false,
    menuOpen: false,
    remindersOn: false,
    reminded: {},
    reminderTimer: null,
    doneLog: {}, // { 'YYYY-MM-DD': jumlah tugas selesai } — tetap ada walau tugas dihapus

    // Kalender & modal
    calYear: now.getFullYear(),
    calMonth: now.getMonth(),
    selectedDate: null,
    dayModalOpen: false,
    formModalOpen: false,
    weekdays: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],

    priorities: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ],

    repeatOptions: [
      { value: 'none', label: 'Tidak berulang' },
      { value: 'daily', label: 'Setiap hari' },
      { value: 'weekly', label: 'Setiap minggu' },
      { value: 'monthly', label: 'Setiap bulan' },
    ],

    filters: [
      { value: 'all', label: 'Semua' },
      { value: 'active', label: 'Belum Selesai' },
      { value: 'completed', label: 'Selesai' },
    ],

    // ---------- Hero Video ----------
    // ISI LINK VIDEO KAMU DI SINI (URL .mp4/.webm atau nama file lokal, mis. 'video.mp4').
    // Video diputar otomatis, tanpa suara, berulang (syarat autoplay di HP).
    hero: {
      videoSrc: 'video.mp4',
      poster: '', // opsional: link gambar yang tampil sebelum video siap
    },
    videoMuted: true,

    toggleMute() {
      const v = this.$refs.heroVideo;
      if (!v) return;
      v.muted = !v.muted;
      this.videoMuted = v.muted;
      if (!v.muted) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      }
    },

    // ---------- Untuk dia ♥ (ISI SESUKAMU) ----------
    // {nama} pada pesan akan diganti dengan herName.
    couple: {
      herName: 'Intann', // nama panggilan dia
      fromName: 'Diyan', // namamu, tampil di bawah pesan harian
      togetherSince: '', // tanggal jadian 'YYYY-MM-DD' (mis. '2024-02-14'). Kosong = penghitung hari disembunyikan
      // Hari spesial. yearly: true = berulang tiap tahun. Anniversary otomatis dibuat dari togetherSince.
      // Contoh ulang tahun dia: { date: '2000-05-20', title: 'Ulang tahun Sayang', yearly: true }
      specialDates: [],
      dailyMessages: [
        'Apa pun yang menunggumu hari ini, kamu pasti bisa. Aku bangga sama kamu.',
        'Jangan lupa makan dan minum ya, {nama}. Tugas boleh menunggu, kamu tidak boleh sakit.',
        'Satu langkah kecil hari ini sudah cukup. Pelan-pelan saja.',
        'Kamu sudah melakukan lebih banyak dari yang kamu kira.',
        'Istirahat sebentar itu bukan malas. Tarik napas, lalu lanjut lagi.',
        'Kalau hari ini terasa berat, ingat: kamu tidak sendirian.',
        'Aku percaya sama kamu, selalu.',
        'Hal-hal kecil yang kamu selesaikan hari ini, semuanya berarti.',
        'Terima kasih sudah berusaha keras setiap hari, {nama}.',
      ],
      cheerMessages: [
        'Mantap, {nama}! Satu tugas beres.',
        'Kamu keren banget hari ini.',
        'Selangkah lebih dekat. Bangga!',
        'Beres! Waktunya tarik napas sebentar.',
        'Terus begitu, {nama}!',
        'Hebat. Satu per satu pasti selesai.',
        'Yeay! Kamu bisa.',
        'Pelan tapi pasti, dan kamu hebat.',
      ],
    },
    hearts: [],

    // Hari spesial buatan sendiri (CRUD, tersimpan di perangkat). Ulang tahun dia (20 Maret) tetap & tidak bisa dihapus.
    specials: [],
    specialsOpen: false,
    specialFormOpen: false,
    specialForm: { id: null, title: '', date: '', yearly: true },
    specialError: '',

    // ---------- Lifecycle ----------
    init() {
      // Setiap bagian dibungkus try/catch: data tersimpan yang aneh tidak boleh membuat aplikasi kosong.
      try {
        // sanitize = migrasi data lama (tanggal, jam, catatan, pengulangan)
        this.tasks = TaskDB.sanitize(TaskDB.getAll());
        TaskDB.saveAll(this.tasks);
      } catch (err) {
        console.warn('[init] data tugas bermasalah, memakai daftar kosong', err);
        this.tasks = [];
      }
      // Simpan otomatis setiap ada perubahan pada daftar tugas
      this.$watch('tasks', (value) => TaskDB.saveAll(value));
      // Pastikan video hero mulai diputar (beberapa browser menunda autoplay)
      this.$nextTick(() => {
        try {
          const v = this.$refs.heroVideo;
          if (!v) return;
          v.muted = true;
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } catch (err) { /* video opsional */ }
      });

      // Tema (kelas 'dark' sudah dipasang lebih awal oleh skrip di <head>)
      this.dark = document.documentElement.classList.contains('dark');

      // Log selesai (buang data lebih dari 120 hari)
      this.doneLog = {};
      try {
        const log = TaskDB.getPref('doneLog', {});
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 120);
        const cutoffISO = toISO(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate());
        Object.keys(log || {}).forEach((d) => {
          if (d >= cutoffISO && Number(log[d]) > 0) this.doneLog[d] = Number(log[d]);
        });
      } catch (err) { this.doneLog = {}; }

      // Hari spesial buatan sendiri
      try {
        this.specials = this.cleanSpecials(TaskDB.getPref('specials', []));
      } catch (err) { this.specials = []; }

      // Pengingat
      this.reminded = {};
      try {
        this.remindersOn = TaskDB.getPref('reminders', false) === true;
        const seen = TaskDB.getPref('reminded', {});
        const keep = Date.now() - 3 * 24 * 3600 * 1000;
        Object.keys(seen || {}).forEach((k) => {
          if (Number(seen[k]) > keep) this.reminded[k] = seen[k];
        });
      } catch (err) { this.reminded = {}; }
      try {
        this.reminderTimer = setInterval(() => {
          try { this.checkReminders(); } catch (e) { /* abaikan */ }
        }, 20000);
        document.addEventListener('visibilitychange', () => {
          try { if (!document.hidden) this.checkReminders(); } catch (e) { /* abaikan */ }
        });
        this.checkReminders();
      } catch (err) { /* pengingat opsional */ }
    },

    // ---------- Computed: statistik & daftar ----------
    get total() {
      return this.tasks.length;
    },
    get completedCount() {
      return this.tasks.filter((t) => t.completed).length;
    },
    get activeCount() {
      return this.total - this.completedCount;
    },
    get progress() {
      return this.total === 0 ? 0 : Math.round((this.completedCount / this.total) * 100);
    },
    get todayCount() {
      const today = todayISO();
      return this.tasks.filter((t) => !t.completed && t.dueDate === today).length;
    },
    get overdueCount() {
      return this.tasks.filter((t) => this.isOverdue(t)).length;
    },
    get weekStats() {
      const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const now = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const date = toISO(d.getFullYear(), d.getMonth(), d.getDate());
        days.push({ date, label: names[d.getDay()], count: this.doneLog[date] || 0, isToday: i === 0 });
      }
      const max = Math.max(1, ...days.map((d) => d.count));
      return days.map((d) => ({ ...d, h: d.count ? 10 + Math.round((d.count / max) * 46) : 4 }));
    },
    get weekTotal() {
      return this.weekStats.reduce((sum, d) => sum + d.count, 0);
    },
    // Hari beruntun: jika hari ini belum ada yang selesai, streak kemarin tetap dihitung
    get streak() {
      const d = new Date();
      const key = () => toISO(d.getFullYear(), d.getMonth(), d.getDate());
      if (!this.doneLog[key()]) d.setDate(d.getDate() - 1);
      let n = 0;
      while (this.doneLog[key()]) {
        n++;
        d.setDate(d.getDate() - 1);
      }
      return n;
    },
    get categories() {
      return [...new Set(this.tasks.map((t) => t.category).filter(Boolean))];
    },
    // Kategori aktif hanya berlaku jika masih ada tugas di kategori itu
    get activeCategory() {
      return this.categories.includes(this.categoryFilter) ? this.categoryFilter : '';
    },
    get hasActiveFilters() {
      return (
        this.filter !== 'all' || this.quick !== 'all' || !!this.activeCategory || !!this.search.trim()
      );
    },
    get filteredTasks() {
      const q = this.search.trim().toLowerCase();
      const today = todayISO();
      return this.tasks
        .filter((t) => {
          if (this.filter === 'active') return !t.completed;
          if (this.filter === 'completed') return t.completed;
          return true;
        })
        .filter((t) => {
          if (this.quick === 'today') return t.dueDate === today;
          if (this.quick === 'overdue') return this.isOverdue(t);
          return true;
        })
        .filter((t) => !this.activeCategory || t.category === this.activeCategory)
        .filter(
          (t) =>
            !q ||
            t.title.toLowerCase().includes(q) ||
            (t.notes || '').toLowerCase().includes(q) ||
            (t.category || '').toLowerCase().includes(q) ||
            (t.subtasks || []).some((s) => s.title.toLowerCase().includes(q))
        )
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            a.dueDate.localeCompare(b.dueDate) ||
            (a.time || '99:99').localeCompare(b.time || '99:99') ||
            b.createdAt - a.createdAt
        );
    },

    // ---------- Computed: kalender ----------
    get monthLabel() {
      return new Date(this.calYear, this.calMonth, 1).toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
      });
    },
    get isCurrentMonth() {
      const n = new Date();
      return this.calYear === n.getFullYear() && this.calMonth === n.getMonth();
    },
    get calendarCells() {
      const y = this.calYear;
      const m = this.calMonth;
      const offset = (new Date(y, m, 1).getDay() + 6) % 7; // minggu dimulai Senin
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const today = todayISO();

      const byDate = {};
      this.tasks.forEach((t) => {
        if (!byDate[t.dueDate]) byDate[t.dueDate] = [];
        byDate[t.dueDate].push(t);
      });

      const cells = [];
      for (let i = 0; i < offset; i++) cells.push({ key: 'blank-' + i, date: null, special: [] });
      for (let d = 1; d <= daysInMonth; d++) {
        const date = toISO(y, m, d);
        const list = (byDate[date] || [])
          .slice()
          .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
        cells.push({
          key: date,
          date,
          day: d,
          isToday: date === today,
          special: this.specialsOn(date),
          count: list.length,
          dots: list.slice(0, 3),
          more: Math.max(0, list.length - 3),
          allDone: list.length > 0 && list.every((t) => t.completed),
        });
      }
      return cells;
    },
    get dayTasks() {
      if (!this.selectedDate) return [];
      return this.tasks
        .filter((t) => t.dueDate === this.selectedDate)
        .sort(
          (a, b) =>
            Number(a.completed) - Number(b.completed) ||
            (a.time || '99:99').localeCompare(b.time || '99:99') ||
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        );
    },

    // ---------- Actions: kalender ----------
    prevMonth() {
      if (this.calMonth === 0) {
        this.calMonth = 11;
        this.calYear--;
      } else this.calMonth--;
    },
    nextMonth() {
      if (this.calMonth === 11) {
        this.calMonth = 0;
        this.calYear++;
      } else this.calMonth++;
    },
    goToday() {
      const n = new Date();
      this.calYear = n.getFullYear();
      this.calMonth = n.getMonth();
    },
    openDay(date) {
      this.selectedDate = date;
      this.dayModalOpen = true;
    },
    closeDay() {
      this.dayModalOpen = false;
    },

    // ---------- Actions: form ----------
    blankForm(date) {
      return { title: '', priority: 'medium', category: '', date: date || todayISO(), time: '', notes: '', repeat: 'none', subtasks: [], newSubtask: '' };
    },
    openAddForm(date) {
      this.editingId = null;
      this.error = '';
      this.form = this.blankForm(date);
      this.formModalOpen = true;
      this.$nextTick(() => this.$refs.titleInput && this.$refs.titleInput.focus());
    },
    startEdit(task) {
      this.editingId = task.id;
      this.error = '';
      this.form = {
        title: task.title,
        priority: task.priority,
        category: task.category,
        date: task.dueDate || todayISO(),
        time: task.time || '',
        notes: task.notes || '',
        repeat: task.repeat || 'none',
        subtasks: clone(task.subtasks || []),
        newSubtask: '',
      };
      this.formModalOpen = true;
      this.$nextTick(() => this.$refs.titleInput && this.$refs.titleInput.focus());
    },
    closeForm() {
      this.formModalOpen = false;
      this.editingId = null;
      this.error = '';
    },
    cancelEdit() {
      this.closeForm();
    },

    submit() {
      const title = this.form.title.trim();
      if (!title) {
        this.error = 'Judul tugas tidak boleh kosong.';
        return;
      }
      if (!this.form.date) {
        this.error = 'Tanggal tugas harus diisi.';
        return;
      }
      this.error = '';
      if (this.form.newSubtask.trim()) this.addSubtask(); // subtugas yang belum ditekan Enter
      const category = this.form.category.trim() || 'Umum';
      const fields = {
        title,
        priority: this.form.priority,
        category,
        dueDate: this.form.date,
        time: this.form.time || '',
        notes: this.form.notes.trim(),
        repeat: this.form.repeat || 'none',
        subtasks: this.form.subtasks.map((s) => ({ id: s.id, title: s.title, done: !!s.done })),
      };

      let saved;
      if (this.editingId) {
        const task = this.tasks.find((t) => t.id === this.editingId);
        if (task) Object.assign(task, fields);
        saved = task;
        this.notify('Perubahan disimpan');
      } else {
        saved = {
          id: TaskDB.generateId(),
          ...fields,
          completed: false,
          completedAt: null,
          spawned: false,
          createdAt: Date.now(),
        };
        this.tasks.push(saved);
        this.notify('Tugas ditambahkan');
      }
      // Jam yang sudah lewat saat tugas dibuat/diubah tidak perlu diingatkan lagi
      if (saved) this.markElapsedReminded([saved]);

      // Pindahkan tampilan kalender ke bulan tanggal tugas
      const d = parseISO(this.form.date);
      this.calYear = d.getFullYear();
      this.calMonth = d.getMonth();
      this.closeForm();
    },

    // ---------- Actions: tugas ----------
    toggle(task) {
      task.completed = !task.completed;
      if (task.completed) {
        task.completedAt = Date.now();
        this.bumpDone(todayISO(), 1);
      } else {
        if (task.completedAt) {
          const c = new Date(task.completedAt);
          this.bumpDone(toISO(c.getFullYear(), c.getMonth(), c.getDate()), -1);
        }
        task.completedAt = null;
      }

      // Tugas berulang: saat diselesaikan, jadwalkan kemunculan berikutnya (sekali saja)
      if (task.completed && task.repeat && task.repeat !== 'none' && !task.spawned) {
        task.spawned = true;
        const next = this.nextDate(task.dueDate, task.repeat);
        this.tasks.push({
          id: TaskDB.generateId(),
          title: task.title,
          priority: task.priority,
          category: task.category,
          dueDate: next,
          time: task.time,
          notes: task.notes,
          repeat: task.repeat,
          subtasks: (task.subtasks || []).map((s) => ({ id: TaskDB.generateId(), title: s.title, done: false })),
          completed: false,
          completedAt: null,
          spawned: false,
          createdAt: Date.now(),
        });
        this.notify('Tugas berulang dijadwalkan ke ' + this.formatDateShort(next));
      } else if (task.completed && this.total > 0 && this.activeCount === 0) {
        this.notify('Semua tugas selesai, ' + this.couple.herName + '! ♥', null, 4000);
        this.celebrate();
      } else if (task.completed) {
        const msg = this.cheer();
        if (msg) this.notify(msg, null, 2200);
      }
    },

    // ---------- Subtugas ----------
    addSubtask() {
      const title = this.form.newSubtask.trim();
      if (!title) return;
      if (this.form.subtasks.length >= 20) {
        this.notify('Maksimal 20 subtugas per tugas');
        return;
      }
      this.form.subtasks.push({ id: TaskDB.generateId(), title: title.slice(0, 80), done: false });
      this.form.newSubtask = '';
    },
    removeSubtask(id) {
      this.form.subtasks = this.form.subtasks.filter((s) => s.id !== id);
    },
    // Semua subtugas selesai -> tugas selesai; membuka lagi satu subtugas -> tugas dibuka kembali
    toggleSub(task, sub) {
      sub.done = !sub.done;
      const all = task.subtasks.length > 0 && task.subtasks.every((s) => s.done);
      if (all && !task.completed) this.toggle(task);
      else if (!sub.done && task.completed) this.toggle(task);
    },
    subDone(task) {
      return (task.subtasks || []).filter((s) => s.done).length;
    },

    // ---------- Pindah & tunda tugas ----------
    startDrag(task, e) {
      this.dragTaskId = task.id;
      if (e && e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', task.id);
          // Tampilkan seluruh baris tugas sebagai bayangan seretan (bukan hanya pegangannya)
          const row = e.target && e.target.closest ? e.target.closest('li') : null;
          if (row && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(row, 24, 24);
        } catch (err) {
          /* abaikan */
        }
      }
    },
    endDrag() {
      this.dragTaskId = null;
      this.dragOverDate = null;
    },
    dropOn(date) {
      const id = this.dragTaskId;
      this.endDrag();
      if (!id || !date) return;
      const task = this.tasks.find((t) => t.id === id);
      if (task && task.dueDate !== date) this.moveTask(task, date);
    },
    moveTask(task, date) {
      const id = task.id;
      const old = task.dueDate;
      task.dueDate = date;
      this.markElapsedReminded([task]);
      this.notify('Dipindahkan ke ' + this.formatDateShort(date), () => {
        const t = this.tasks.find((x) => x.id === id);
        if (t) t.dueDate = old;
      });
    },
    // Tunda ke besok (jika sudah lewat, dihitung dari hari ini)
    snooze(task) {
      const today = todayISO();
      const base = task.dueDate < today ? today : task.dueDate;
      this.moveTask(task, this.nextDate(base, 'daily'));
    },

    bumpDone(date, delta) {
      const n = Math.max(0, (this.doneLog[date] || 0) + delta);
      const next = { ...this.doneLog };
      if (n > 0) next[date] = n;
      else delete next[date];
      this.doneLog = next;
      TaskDB.setPref('doneLog', next);
    },

    nextDate(iso, repeat) {
      const d = parseISO(iso);
      if (repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (repeat === 'monthly') {
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay)); // 31 Jan -> 28/29 Feb
      }
      return toISO(d.getFullYear(), d.getMonth(), d.getDate());
    },

    // Hapus berdasarkan id: susun ulang array, simpan langsung, lalu pastikan tampilan ikut berubah.
    remove(task) {
      try {
        const id = task && task.id;
        const found = this.tasks.find((t) => t.id === id);
        if (!found) return;
        const copy = clone(found);
        this.tasks = this.tasks.filter((t) => t.id !== id);
        TaskDB.saveAll(this.tasks);
        if (this.editingId === id) this.closeForm();
        this.notify('Tugas dihapus (sisa ' + this.tasks.length + ')', () => this.restoreTasks([copy]));
      } catch (err) {
        console.error('[remove]', err);
        this.notify('Gagal menghapus: ' + ((err && err.message) || err), null, 6000);
      }
    },

    clearCompleted() {
      try {
        const removed = this.tasks.filter((t) => t.completed).map((t) => clone(t));
        if (removed.length === 0) return;
        this.tasks = this.tasks.filter((t) => !t.completed);
        TaskDB.saveAll(this.tasks);
        this.notify(removed.length + ' tugas selesai dibersihkan', () => this.restoreTasks(removed));
      } catch (err) {
        console.error('[clearCompleted]', err);
        this.notify('Gagal membersihkan: ' + ((err && err.message) || err), null, 6000);
      }
    },

    // Mengembalikan tugas yang dihapus. Aman dipanggil berkali-kali (tidak membuat duplikat).
    restoreTasks(list) {
      const ids = new Set(this.tasks.map((t) => t.id));
      const fresh = list.filter((t) => !ids.has(t.id));
      if (fresh.length) {
        this.tasks = this.tasks.concat(fresh);
        TaskDB.saveAll(this.tasks);
      }
      return fresh.length;
    },

    // ---------- Actions: filter ----------
    setQuick(value) {
      this.quick = this.quick === value ? 'all' : value;
      if (this.quick !== 'all') {
        this.filter = 'all';
        this.search = '';
        this.$nextTick(() => {
          const el = document.getElementById('daftar-tugas');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    },
    resetFilters() {
      this.filter = 'all';
      this.quick = 'all';
      this.categoryFilter = '';
      this.search = '';
    },

    // ---------- Actions: backup ----------
    exportData() {
      if (this.tasks.length === 0) {
        this.notify('Belum ada data untuk diekspor');
        return;
      }
      const blob = new Blob([TaskDB.exportJSON(this.tasks, this.doneLog)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'maroon-tasks-' + todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.notify(this.tasks.length + ' tugas diekspor');
    },
    importData(event) {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const incoming = TaskDB.parseImport(reader.result);
          const ids = new Set(this.tasks.map((t) => t.id));
          const fresh = incoming.filter((t) => !ids.has(t.id));
          this.tasks.push(...fresh);
          // Gabungkan log selesai (ambil nilai terbesar per hari)
          const log = TaskDB.parseDoneLog(reader.result);
          const merged = { ...this.doneLog };
          Object.keys(log).forEach((d) => {
            merged[d] = Math.max(merged[d] || 0, log[d]);
          });
          this.doneLog = merged;
          TaskDB.setPref('doneLog', merged);
          const skipped = incoming.length - fresh.length;
          this.notify(fresh.length + ' tugas diimpor' + (skipped ? ', ' + skipped + ' sudah ada' : ''));
        } catch (err) {
          this.notify('File tidak valid. Gunakan file hasil ekspor aplikasi ini.');
        }
      };
      reader.onerror = () => this.notify('Gagal membaca file.');
      reader.readAsText(file);
      input.value = ''; // izinkan memilih file yang sama lagi
    },

    // ---------- Tema ----------
    toggleDark() {
      this.dark = !this.dark;
      document.documentElement.classList.toggle('dark', this.dark);
      TaskDB.setPref('theme', this.dark ? 'dark' : 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', this.dark ? '#170b0e' : '#800020');
    },

    // ---------- Pengingat ----------
    canNotify() {
      return typeof Notification !== 'undefined';
    },
    toggleReminders() {
      if (this.remindersOn) {
        this.remindersOn = false;
        TaskDB.setPref('reminders', false);
        this.notify('Pengingat dimatikan');
        return;
      }
      this.remindersOn = true;
      TaskDB.setPref('reminders', true);
      this.markElapsedReminded(this.tasks); // hanya jam yang akan datang yang diingatkan
      const inApp = () => this.notify('Pengingat aktif (tampil di dalam aplikasi)', null, 4000);
      if (!this.canNotify()) return inApp();
      if (Notification.permission === 'granted') return this.notify('Pengingat aktif dengan notifikasi browser');
      if (Notification.permission === 'denied') return inApp();
      try {
        const res = Notification.requestPermission((p) => {
          if (p === 'granted') this.notify('Pengingat aktif dengan notifikasi browser');
          else inApp();
        });
        if (res && typeof res.then === 'function') {
          res
            .then((p) => (p === 'granted' ? this.notify('Pengingat aktif dengan notifikasi browser') : inApp()))
            .catch(inApp);
        }
      } catch (err) {
        inApp();
      }
    },
    reminderKey(task) {
      return task.id + '|' + task.dueDate + '|' + task.time;
    },
    markElapsedReminded(list, now = new Date()) {
      const today = toISO(now.getFullYear(), now.getMonth(), now.getDate());
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let changed = false;
      list.forEach((t) => {
        if (t.dueDate !== today || !t.time) return;
        const [h, m] = t.time.split(':').map(Number);
        if (nowMin >= h * 60 + m && !this.reminded[this.reminderKey(t)]) {
          this.reminded[this.reminderKey(t)] = Date.now();
          changed = true;
        }
      });
      if (changed) TaskDB.setPref('reminded', this.reminded);
    },
    // Mengingatkan tugas hari ini yang jamnya tiba (berlaku 30 menit setelah jam tugas)
    checkReminders(now = new Date()) {
      if (!this.remindersOn) return;
      const today = toISO(now.getFullYear(), now.getMonth(), now.getDate());
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let changed = false;
      this.tasks.forEach((t) => {
        if (t.completed || t.dueDate !== today || !t.time) return;
        const [h, m] = t.time.split(':').map(Number);
        const diff = nowMin - (h * 60 + m);
        if (diff < 0 || diff > 30) return;
        const key = this.reminderKey(t);
        if (this.reminded[key]) return;
        this.reminded[key] = Date.now();
        changed = true;
        this.fireReminder(t);
      });
      if (changed) TaskDB.setPref('reminded', this.reminded);
    },
    fireReminder(task) {
      this.notify('⏰ ' + task.time + ' — ' + task.title, null, 9000);
      if (this.canNotify() && Notification.permission === 'granted') {
        try {
          new Notification('Pengingat tugas', { body: task.time + ' · ' + task.title });
        } catch (err) {
          /* beberapa browser mobile melarang konstruktor Notification */
        }
      }
    },

    // ---------- Pintasan keyboard ----------
    onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target || {};
      const tag = String(el.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || el.isContentEditable) return;
      if (this.formModalOpen || this.dayModalOpen) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.openAddForm();
      } else if (e.key === '/') {
        e.preventDefault();
        const s = document.getElementById('search');
        if (s) s.focus();
      }
    },

    // ---------- Untuk dia ♥ ----------
    fillName(text) {
      return String(text || '').split('{nama}').join(this.couple.herName);
    },
    get greeting() {
      const h = new Date().getHours();
      const part = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
      return 'Selamat ' + part + ', ' + this.couple.herName;
    },
    // Satu pesan per hari, berganti otomatis tiap tengah malam
    dailyMessageFor(now = new Date()) {
      const list = this.couple.dailyMessages || [];
      if (!list.length) return '';
      const dayIndex = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
      return this.fillName(list[dayIndex % list.length]);
    },
    get dailyMessage() {
      return this.dailyMessageFor();
    },
    cheer() {
      const list = this.couple.cheerMessages || [];
      return list.length ? this.fillName(list[Math.floor(Math.random() * list.length)]) : '';
    },
    celebrate() {
      if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const base = Date.now();
      this.hearts = Array.from({ length: 16 }, (_, i) => ({
        id: base + i,
        left: Math.round(4 + Math.random() * 92),
        size: Math.round(14 + Math.random() * 20),
        delay: Math.round(Math.random() * 80) / 100,
        dur: Math.round(240 + Math.random() * 140) / 100,
      }));
      setTimeout(() => {
        this.hearts = [];
      }, 4800);
    },

    // Hari spesial = daftar buatan sendiri + anniversary dari togetherSince
    get specialDaysAll() {
      const list = [
        { id: 'birthday', date: '2000-03-20', title: 'Ulang tahun kamu', yearly: true, locked: true },
        ...(this.couple.specialDates || []).map((s, i) => ({ ...s, id: s.id || 'cfg' + i })),
        ...this.specials.map((s) => ({ ...s })),
      ];
      if (this.couple.togetherSince) {
        list.push({ id: 'anniv', date: this.couple.togetherSince, title: 'Anniversary kita', yearly: true, milestone: true, locked: true });
      }
      return list.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.title);
    },
    cleanSpecials(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set();
      return list
        .filter((s) => s && typeof s.title === 'string' && s.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
        .map((s) => {
          let id = typeof s.id === 'string' && s.id && s.id !== 'birthday' && s.id !== 'anniv' ? s.id : TaskDB.generateId();
          if (seen.has(id)) id = TaskDB.generateId();
          seen.add(id);
          return { id, title: s.title.trim().slice(0, 60), date: s.date, yearly: s.yearly !== false };
        });
    },
    saveSpecials() {
      TaskDB.setPref('specials', this.specials);
    },
    // Daftar lengkap untuk panel kelola: terdekat dulu, yang sudah lewat (sekali saja) di bawah
    get specialsManage() {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return this.specialDaysAll
        .map((s) => {
          const o = this.nextOccurrence(s, today);
          return { ...s, daysLeft: o ? o.daysLeft : 99999, past: !o };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft);
    },
    openSpecialForm(s) {
      this.specialError = '';
      this.specialsOpen = true;
      this.specialFormOpen = true;
      this.specialForm = s
        ? { id: s.id, title: s.title, date: s.date, yearly: s.yearly !== false }
        : { id: null, title: '', date: '', yearly: true };
    },
    cancelSpecialForm() {
      this.specialFormOpen = false;
      this.specialForm = { id: null, title: '', date: '', yearly: true };
      this.specialError = '';
    },
    submitSpecial() {
      const title = this.specialForm.title.trim();
      if (!title) { this.specialError = 'Nama hari spesial tidak boleh kosong.'; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.specialForm.date || '')) { this.specialError = 'Tanggal harus diisi.'; return; }
      const fields = { title: title.slice(0, 60), date: this.specialForm.date, yearly: !!this.specialForm.yearly };
      if (this.specialForm.id) {
        const idx = this.specials.findIndex((s) => s.id === this.specialForm.id);
        if (idx !== -1) this.specials = this.specials.map((s, i) => (i === idx ? { ...s, ...fields } : s));
        this.notify('Hari spesial diperbarui');
      } else {
        this.specials = this.specials.concat([{ id: TaskDB.generateId(), ...fields }]);
        this.notify('Hari spesial ditambahkan');
      }
      this.saveSpecials();
      this.cancelSpecialForm();
    },
    removeSpecial(s) {
      if (!s || s.locked) return;
      const found = this.specials.find((x) => x.id === s.id);
      if (!found) return;
      const copy = { ...found };
      this.specials = this.specials.filter((x) => x.id !== s.id);
      this.saveSpecials();
      if (this.specialForm.id === s.id) this.cancelSpecialForm();
      this.notify('Hari spesial dihapus', () => {
        if (!this.specials.some((x) => x.id === copy.id)) {
          this.specials = this.specials.concat([copy]);
          this.saveSpecials();
        }
      });
    },
    nextOccurrence(s, today) {
      const [y, m, d] = s.date.split('-').map(Number);
      let target;
      if (s.yearly) {
        target = new Date(today.getFullYear(), m - 1, d);
        if (target < today) target = new Date(today.getFullYear() + 1, m - 1, d);
      } else {
        target = new Date(y, m - 1, d);
        if (target < today) return null;
      }
      const years = target.getFullYear() - y;
      return {
        target,
        daysLeft: Math.round((target - today) / 86400000),
        ordinal: s.milestone && s.yearly && years > 0 ? years : null,
      };
    },
    upcomingSpecialsFrom(now = new Date()) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return this.specialDaysAll
        .map((s, i) => {
          const o = this.nextOccurrence(s, today);
          if (!o) return null;
          return {
            key: s.id || i + '|' + s.title,
            title: s.title,
            iso: toISO(o.target.getFullYear(), o.target.getMonth(), o.target.getDate()),
            daysLeft: o.daysLeft,
            ordinal: o.ordinal,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 3);
    },
    get upcomingSpecials() {
      return this.upcomingSpecialsFrom();
    },
    togetherDaysFrom(now = new Date()) {
      const since = this.couple.togetherSince;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since || '')) return null;
      const [y, m, d] = since.split('-').map(Number);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.round((today - new Date(y, m - 1, d)) / 86400000);
      return diff >= 0 ? diff : null;
    },
    get togetherDays() {
      return this.togetherDaysFrom();
    },
    get togetherDaysText() {
      const n = this.togetherDays;
      return n === null ? '' : n.toLocaleString('id-ID');
    },
    specialLabel(s) {
      return s.daysLeft === 0 ? 'Hari ini!' : s.daysLeft === 1 ? 'Besok' : s.daysLeft + ' hari lagi';
    },
    specialsOn(date) {
      return this.specialDaysAll
        .filter((s) => (s.yearly ? date.slice(5) === s.date.slice(5) && date >= s.date : date === s.date))
        .map((s) => s.title);
    },
    get daySpecials() {
      return this.selectedDate ? this.specialsOn(this.selectedDate) : [];
    },

    // ---------- Toast ----------
    notify(message, undo, duration) {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message, undo: undo || null });
      setTimeout(() => this.dismissToast(id), duration || (undo ? 6000 : 2800));
    },
    dismissToast(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
    undoToast(toast) {
      if (toast.undo) toast.undo();
      this.dismissToast(toast.id);
    },

    // ---------- Helpers (UI) ----------
    formatDateLong(s) {
      if (!s) return '';
      return parseISO(s).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    },
    formatDateShort(s) {
      if (!s) return '';
      return parseISO(s).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    },
    isOverdue(task) {
      return !task.completed && !!task.dueDate && task.dueDate < todayISO();
    },
    repeatLabel(r) {
      return { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' }[r] || '';
    },
    priorityBadge(p) {
      return {
        high: 'bg-rose-900 text-white dark:bg-rose-600',
        medium: 'bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300',
        low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-300',
      }[p];
    },
    priorityBar(p) {
      return { high: 'bg-rose-900 dark:bg-rose-500', medium: 'bg-amber-400', low: 'bg-emerald-400' }[p];
    },
    priorityLabel(p) {
      return { high: 'High', medium: 'Medium', low: 'Low' }[p];
    },
    emptyState() {
      if (this.total === 0) {
        return {
          title: 'Belum ada tugas',
          text: 'Mulai hari ini dengan menambahkan tugas pertamamu lewat tombol di kalender.',
        };
      }
      if (this.search.trim()) {
        return { title: 'Tidak ditemukan', text: 'Tidak ada tugas yang cocok dengan pencarianmu.' };
      }
      if (this.quick !== 'all' || this.activeCategory) {
        return {
          title: 'Tidak ada tugas di filter ini',
          text: 'Coba ubah atau reset filter yang sedang aktif.',
        };
      }
      return {
        title: this.filter === 'completed' ? 'Belum ada tugas selesai' : 'Semua tugas selesai! 🎉',
        text:
          this.filter === 'completed'
            ? 'Selesaikan satu tugas dan ia akan muncul di sini.'
            : 'Kerja bagus. Tidak ada tugas yang tertunda.',
      };
    },
  };
}
