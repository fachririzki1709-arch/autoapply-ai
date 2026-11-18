document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching (Daftar File PDF vs Preset Bundel Peran)
  document.querySelectorAll('[data-doc-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-doc-tab');
      document.querySelectorAll('[data-doc-tab]').forEach((t) => {
        t.classList.remove('bg-[#C6601F]', 'text-[#EADCC8]');
        t.classList.add('bg-[#0A0F14]', 'text-[#7FB3B8]');
      });
      tab.classList.remove('bg-[#0A0F14]', 'text-[#7FB3B8]');
      tab.classList.add('bg-[#C6601F]', 'text-[#EADCC8]');

      document.getElementById('tabFilesPanel').classList.toggle('hidden', target !== 'files');
      document.getElementById('tabPresetsPanel').classList.toggle('hidden', target !== 'presets');
    });
  });

  // Unggah PDF Baru
  document.getElementById('uploadPdfForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Mengunggah & Mengekstrak Teks...';

    try {
      const formData = new FormData(form);
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        window.showToast(data.message);
        setTimeout(() => window.location.reload(), 700);
      } else {
        window.showToast(data.message || 'Gagal mengunggah berkas PDF.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unggah ke GridFS';
    }
  });

  // Modal Pratinjau Hasil Ekstraksi Teks CV (pdf-parse)
  document.querySelectorAll('[data-preview-extracted]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const title = btn.getAttribute('data-doc-title');
      const text = btn.getAttribute('data-extracted-text') || '(Tidak ada teks terbaca pada PDF ini)';
      document.getElementById('extractedModalTitle').textContent = `Hasil Ekstraksi Teks: ${title}`;
      document.getElementById('extractedModalBody').textContent = text;
      document.getElementById('extractedTextModal').classList.remove('hidden');
    });
  });

  document.getElementById('closeExtractedModal')?.addEventListener('click', () => {
    document.getElementById('extractedTextModal').classList.add('hidden');
  });

  // Hapus Dokumen PDF
  document.querySelectorAll('[data-delete-doc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const docId = btn.getAttribute('data-delete-doc');
      if (!confirm('Hapus berkas PDF ini secara permanen dari MongoDB GridFS?')) return;

      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        window.showToast(data.message);
        setTimeout(() => window.location.reload(), 500);
      }
    });
  });

  // Buat Preset Bundel Peran Baru (Auto-Merge + Compress <= 2MB)
  document.getElementById('createPresetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Menggabungkan & Mengompresi PDF...';

    const selectedItems = [];
    form.querySelectorAll('[data-preset-doc-check]:checked').forEach((chk) => {
      const docId = chk.value;
      const orderInput = form.querySelector(`[data-preset-doc-order="${docId}"]`);
      selectedItems.push({
        documentId: docId,
        order: Number(orderInput?.value || 99),
      });
    });

    selectedItems.sort((a, b) => a.order - b.order);

    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetName: form.presetName.value,
          mergedFileName: form.mergedFileName.value,
          roleKeywords: form.roleKeywords.value,
          isDefault: form.isDefault.checked,
          orderedDocuments: selectedItems,
        }),
      });
      const data = await res.json();
      if (data.success) {
        window.showToast(data.message);
        setTimeout(() => window.location.reload(), 900);
      } else {
        window.showToast(data.message || 'Gagal membangun preset.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan & Build PDF Terkompresi';
    }
  });

  // Rebuild Preset
  document.querySelectorAll('[data-rebuild-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const presetId = btn.getAttribute('data-rebuild-preset');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      const res = await fetch(`/api/presets/${presetId}/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        window.showToast(data.message);
        setTimeout(() => window.location.reload(), 700);
      } else {
        window.showToast(data.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Build Ulang';
      }
    });
  });

  // Hapus Preset
  document.querySelectorAll('[data-delete-preset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const presetId = btn.getAttribute('data-delete-preset');
      if (!confirm('Hapus preset bundel dokumen ini?')) return;
      const res = await fetch(`/api/presets/${presetId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        window.showToast(data.message);
        setTimeout(() => window.location.reload(), 500);
      }
    });
  });
});