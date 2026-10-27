/**
 * database.js
 * Lapisan penyimpanan data (LocalStorage) untuk aplikasi To-Do List.
 * Semua akses ke localStorage dipusatkan di sini agar mudah diganti
 * (misalnya ke IndexedDB atau API) tanpa mengubah controller.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'maroon-todo:tasks:v1';
  const PRIORITIES = ['low', 'medium', 'high'];
  const REPEATS = ['none', 'daily', 'weekly', 'monthly'];
  const PREF_PREFIX = 'maroon-todo:pref:';

  const pad2 = (n) => String(n).padStart(2, '0');
  const isoFromTimestamp = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const TaskDB = {
    /** Ambil semua tugas dari LocalStorage. */
    getAll() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : [];
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn('[TaskDB] Gagal membaca data:', err);
        return [];
      }
    },

    /** Simpan seluruh daftar tugas. */
    saveAll(tasks) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return true;
      } catch (err) {
        console.warn('[TaskDB] Gagal menyimpan data:', err);
        return false;
      }
    },

    /** Hapus seluruh data tersimpan. */
    clear() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (err) {
        console.warn('[TaskDB] Gagal menghapus data:', err);
      }
    },

    /** Preferensi kecil (tema, pengingat, log selesai) disimpan sebagai JSON. */
    getPref(key, fallback) {
      try {
        const raw = localStorage.getItem(PREF_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    setPref(key, value) {
      try {
        localStorage.setItem(PREF_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    },

    /** Buat ID unik untuk tugas baru. */
    generateId() {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    /**
     * Bersihkan & lengkapi data tugas (juga dipakai untuk migrasi data lama
     * dan validasi hasil impor). Entri tanpa judul dibuang.
     */
    sanitize(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set(); // id ganda (data lama/impor) diberi id baru agar daftar & hapus tidak bentrok
      return list
        .filter((t) => t && typeof t.title === 'string' && t.title.trim())
        .map((t) => {
          const createdAt = Number(t.createdAt) || Date.now();
          let id = typeof t.id === 'string' && t.id ? t.id : TaskDB.generateId();
          if (seen.has(id)) id = TaskDB.generateId();
          seen.add(id);
          return {
            id,
            title: t.title.trim().slice(0, 120),
            priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
            category: String(t.category || 'Umum').trim().slice(0, 30) || 'Umum',
            dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : isoFromTimestamp(createdAt),
            time: /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) ? t.time : '',
            notes: typeof t.notes === 'string' ? t.notes.slice(0, 500) : '',
            repeat: REPEATS.includes(t.repeat) ? t.repeat : 'none',
            completed: Boolean(t.completed),
            completedAt: t.completed && Number(t.completedAt) ? Number(t.completedAt) : null,
            spawned: Boolean(t.spawned),
            subtasks: Array.isArray(t.subtasks)
              ? (() => {
                  const subSeen = new Set();
                  return t.subtasks
                    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
                    .slice(0, 20)
                    .map((s) => {
                      let sid = typeof s.id === 'string' && s.id ? s.id : TaskDB.generateId();
                      if (subSeen.has(sid)) sid = TaskDB.generateId();
                      subSeen.add(sid);
                      return { id: sid, title: s.title.trim().slice(0, 80), done: Boolean(s.done) };
                    });
                })()
              : [],
            createdAt,
          };
        });
    },

    /** Ubah daftar tugas menjadi teks JSON untuk backup. */
    exportJSON(tasks, doneLog) {
      return JSON.stringify(
        { app: 'maroon-tasks', version: 1, exportedAt: new Date().toISOString(), tasks, doneLog: doneLog || {} },
        null,
        2
      );
    },

    /** Baca teks JSON hasil ekspor. Melempar error jika formatnya tidak dikenali. */
    parseImport(text) {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data && data.tasks;
      if (!Array.isArray(list)) throw new Error('Format file tidak dikenali');
      return TaskDB.sanitize(list);
    },

    /** Ambil log tugas selesai per hari dari file ekspor (abaikan entri tidak valid). */
    parseDoneLog(text) {
      const out = {};
      try {
        const log = JSON.parse(text).doneLog;
        Object.keys(log || {}).forEach((date) => {
          const n = Math.floor(Number(log[date]));
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && n > 0 && n < 10000) out[date] = n;
        });
      } catch (err) {
        /* tidak ada log */
      }
      return out;
    },
  };

  global.TaskDB = TaskDB;
})(window);
