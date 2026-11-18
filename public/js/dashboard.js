document.addEventListener('DOMContentLoaded', () => {
  const draftsData = window.__INITIAL_DRAFTS__ || [];
  const presetsData = window.__INITIAL_PRESETS__ || [];
  let activeStageFilter = 'draft_pending';
  let activePlatformFilter = 'all';
  let activeSearchQuery = '';
  let selectedDraftId = draftsData[0]?._id || null;

  const queueListEl = document.getElementById('draftQueueList');
  const queueSkeletonEl = document.getElementById('queueSkeletonLoader');

  // Render daftar antrean draf (Kartu 5)
  function renderDraftQueue() {
    if (!queueListEl) return;

    const filtered = draftsData.filter((d) => {
      const stageMatch =
        activeStageFilter === 'all'
          ? true
          : activeStageFilter === 'sent_group'
          ? ['sent', 'in_review', 'interview', 'offered'].includes(d.applicationStage)
          : activeStageFilter === 'rejected_group'
          ? ['company_rejected', 'user_discarded'].includes(d.applicationStage)
          : d.applicationStage === activeStageFilter;

      const platformMatch =
        activePlatformFilter === 'all'
          ? true
          : activePlatformFilter === 'quick_capture'
          ? d.jobId?.inputSource === 'manual_quick_capture'
          : d.jobId?.sourcePlatform === activePlatformFilter;

      const q = activeSearchQuery.toLowerCase();
      const textMatch =
        !q ||
        (d.jobId?.jobTitle || '').toLowerCase().includes(q) ||
        (d.jobId?.companyName || '').toLowerCase().includes(q) ||
        (d.recipientEmail || '').toLowerCase().includes(q);

      return stageMatch && platformMatch && textMatch;
    });

    if (filtered.length === 0) {
      queueListEl.innerHTML = `
        <div class="p-6 text-center rounded-xl bg-[#0A0F14]/70 border border-[#7FB3B8]/15">
          <p class="text-xs text-[#7FB3B8]">Tidak ada draf pada filter ini. Gunakan <b>Input Cepat</b> atau <b>Pindai AI</b>.</p>
        </div>`;
      return;
    }

    queueListEl.innerHTML = filtered
      .map((draft) => {
        const isSelected = draft._id === selectedDraftId;
        const score = draft.matchScore || 0;
        const scoreBadgeClass =
          score >= 85
            ? 'bg-[#C6601F]/20 border-[#C6601F] text-[#EADCC8]'
            : 'bg-[#2E6F73]/35 border-[#7FB3B8] text-[#7FB3B8]';

        return `
          <div
            data-select-draft="${draft._id}"
            class="cursor-pointer rounded-xl p-3.5 border transition-all ${
              isSelected
                ? 'bg-[#2E6F73]/35 border-[#C6601F] shadow-lg'
                : 'bg-[#0A0F14]/80 border-[#7FB3B8]/20 hover:border-[#7FB3B8]/50'
            }"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#0F3D3E] text-[#7FB3B8] border border-[#7FB3B8]/25">
                    ${draft.jobId?.sourcePlatform || 'portal'}
                  </span>
                  ${
                    draft.jobId?.inputSource === 'manual_quick_capture'
                      ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#2E6F73]/40 text-[#EADCC8]">Quick Capture</span>'
                      : ''
                  }
                  ${
                    draft.isDuplicateWarning
                      ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-950/90 border border-red-500/60 text-red-300">Duplikat &lt;30H</span>'
                      : ''
                  }
                  ${
                    draft.jobId?.mandatorySubjectRule
                      ? '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950/90 border border-sky-400/50 text-sky-200">Subjek Wajib</span>'
                      : ''
                  }
                </div>
                <h4 class="text-[14px] font-semibold text-[#EADCC8] truncate">${
                  draft.jobId?.jobTitle || 'Posisi Lowongan'
                }</h4>
                <p class="text-[12px] text-[#7FB3B8] truncate">${
                  draft.jobId?.companyName || '-'
                } • ${draft.jobId?.location || 'Indonesia'}</p>
              </div>
              <span class="shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold tabular-nums ${scoreBadgeClass}">
                ${score}%
              </span>
            </div>
          </div>`;
      })
      .join('');

    queueListEl.querySelectorAll('[data-select-draft]').forEach((el) => {
      el.addEventListener('click', () => {
        selectedDraftId = el.getAttribute('data-select-draft');
        renderDraftQueue();
        populateDraftEditor(selectedDraftId);
      });
    });
  }

  // Isi Panel Editor Draf & Copilot AI (Kartu 6)
  function populateDraftEditor(draftId) {
    const draft = draftsData.find((d) => d._id === draftId);
    if (!draft) return;

    document.getElementById('editorDraftId').value = draft._id;
    document.getElementById('editorJobTitle').textContent = draft.jobId?.jobTitle || '-';
    document.getElementById('editorCompanyMeta').textContent = `${
      draft.jobId?.companyName || '-'
    } • ${draft.jobId?.location || 'Indonesia'}`;

    // AI Reasoning Bubble
    const reasoningList = document.getElementById('editorAiReasoning');
    reasoningList.innerHTML = (draft.matchReasoning || [])
      .map((r) => `<li class="text-[12px] text-[#EADCC8]/90 leading-relaxed">• ${r}</li>`)
      .join('');

    // Mandatory Subject Badge
    const subjectRuleBox = document.getElementById('editorSubjectRuleBox');
    const subjectRuleText = document.getElementById('editorSubjectRuleText');
    if (draft.jobId?.mandatorySubjectRule) {
      subjectRuleBox.classList.remove('hidden');
      subjectRuleText.textContent = draft.jobId.mandatorySubjectRule;
    } else {
      subjectRuleBox.classList.add('hidden');
    }

    // Duplicate 30-Day Warning Banner
    const dupBanner = document.getElementById('editorDuplicateBanner');
    const dupText = document.getElementById('editorDuplicateText');
    const dupCheckbox = document.getElementById('confirmDuplicateOverride');
    if (draft.isDuplicateWarning) {
      dupBanner.classList.remove('hidden');
      dupText.textContent =
        draft.previousApplicationInfo || 'Perusahaan ini sudah dilamar dalam 30 hari terakhir.';
      if (dupCheckbox) dupCheckbox.checked = false;
    } else {
      dupBanner.classList.add('hidden');
    }

    document.getElementById('editorRecipientEmail').value = draft.recipientEmail || '';
    document.getElementById('editorEmailSubject').value = draft.emailSubject || '';
    document.getElementById('editorEmailBody').value = draft.emailBody || '';

    const presetSelect = document.getElementById('editorPresetSelect');
    if (draft.attachmentMode === 'cv_only') {
      presetSelect.value = 'cv_only';
    } else if (draft.selectedPresetId?._id) {
      presetSelect.value = draft.selectedPresetId._id;
    } else if (draft.selectedPresetId) {
      presetSelect.value = draft.selectedPresetId;
    }
    updatePresetAttachmentMeta();
  }

  function updatePresetAttachmentMeta() {
    const val = document.getElementById('editorPresetSelect')?.value;
    const infoEl = document.getElementById('editorAttachmentMeta');
    const previewLink = document.getElementById('editorPreviewPdfBtn');
    if (!infoEl) return;

    if (val === 'cv_only') {
      infoEl.textContent = 'Mode Lampiran: Hanya File CV Utama (PDF)';
      if (previewLink) previewLink.classList.add('hidden');
      return;
    }

    const preset = presetsData.find((p) => p._id === val);
    if (preset && preset.mergedStorageFileId) {
      const sizeKB = Math.round((preset.compressedSizeBytes || 0) / 1024);
      infoEl.textContent = `${preset.mergedFileName} (${preset.totalPages} hal • ${sizeKB} KB terkompresi <= 2MB)`;
      if (previewLink) {
        previewLink.href = `/api/files/gridfs/${preset.mergedStorageFileId}`;
        previewLink.classList.remove('hidden');
      }
    } else {
      infoEl.textContent = 'Preset belum memiliki file PDF tergabung. Build di Gudang Dokumen.';
      if (previewLink) previewLink.classList.add('hidden');
    }
  }

  document.getElementById('editorPresetSelect')?.addEventListener('change', updatePresetAttachmentMeta);

  // Tab Filter Status (Menunggu / Terkirim / Ditolak)
  document.querySelectorAll('[data-stage-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeStageFilter = tab.getAttribute('data-stage-tab');
      document.querySelectorAll('[data-stage-tab]').forEach((t) => {
        t.classList.remove('bg-[#C6601F]', 'text-[#EADCC8]');
        t.classList.add('bg-[#0A0F14]', 'text-[#7FB3B8]');
      });
      tab.classList.remove('bg-[#0A0F14]', 'text-[#7FB3B8]');
      tab.classList.add('bg-[#C6601F]', 'text-[#EADCC8]');
      renderDraftQueue();
    });
  });

  // Filter Platform Pills
  document.querySelectorAll('[data-platform-filter]').forEach((pill) => {
    pill.addEventListener('click', () => {
      activePlatformFilter = pill.getAttribute('data-platform-filter');
      document.querySelectorAll('[data-platform-filter]').forEach((p) => {
        p.classList.remove('bg-[#2E6F73]', 'text-[#EADCC8]', 'border-[#7FB3B8]');
        p.classList.add('bg-[#0A0F14]/80', 'text-[#7FB3B8]', 'border-[#7FB3B8]/20');
      });
      pill.classList.remove('bg-[#0A0F14]/80', 'text-[#7FB3B8]', 'border-[#7FB3B8]/20');
      pill.classList.add('bg-[#2E6F73]', 'text-[#EADCC8]', 'border-[#7FB3B8]');
      renderDraftQueue();
    });
  });

  // Global & Local Real-Time Search
  ['globalSearchInput', 'localQueueSearch'].forEach((inputId) => {
    document.getElementById(inputId)?.addEventListener('input', (e) => {
      activeSearchQuery = e.target.value || '';
      renderDraftQueue();
    });
  });

  // Simpan Draf
  document.getElementById('saveDraftBtn')?.addEventListener('click', async () => {
    const draftId = document.getElementById('editorDraftId').value;
    if (!draftId) return;

    const presetVal = document.getElementById('editorPresetSelect').value;
    const payload = {
      recipientEmail: document.getElementById('editorRecipientEmail').value,
      emailSubject: document.getElementById('editorEmailSubject').value,
      emailBody: document.getElementById('editorEmailBody').value,
      attachmentMode: presetVal === 'cv_only' ? 'cv_only' : 'preset_bundle',
      selectedPresetId: presetVal === 'cv_only' ? null : presetVal,
    };

    const res = await fetch(`/api/drafts/${draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast('Perubahan draf berhasil disimpan.');
    } else {
      window.showToast(data.message || 'Gagal menyimpan draf.', 'error');
    }
  });

  // Buang Draf
  document.getElementById('discardDraftBtn')?.addEventListener('click', async () => {
    const draftId = document.getElementById('editorDraftId').value;
    if (!draftId) return;

    const res = await fetch(`/api/drafts/${draftId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationStage: 'user_discarded' }),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast('Draf dipindahkan ke arsip ditolak/dibuang.');
      setTimeout(() => window.location.reload(), 600);
    }
  });

  // Kirim Lamaran Satu Klik
  document.getElementById('sendApplicationBtn')?.addEventListener('click', async () => {
    const draftId = document.getElementById('editorDraftId').value;
    if (!draftId) return;

    const btn = document.getElementById('sendApplicationBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Mengirim Email & PDF...';

    const presetVal = document.getElementById('editorPresetSelect').value;
    const confirmOverride = Boolean(document.getElementById('confirmDuplicateOverride')?.checked);

    try {
      const res = await fetch(`/api/drafts/${draftId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: document.getElementById('editorRecipientEmail').value,
          emailSubject: document.getElementById('editorEmailSubject').value,
          emailBody: document.getElementById('editorEmailBody').value,
          attachmentMode: presetVal === 'cv_only' ? 'cv_only' : 'preset_bundle',
          selectedPresetId: presetVal === 'cv_only' ? null : presetVal,
          confirmDuplicateOverride: confirmOverride,
        }),
      });
      const result = await res.json();
      if (result.success) {
        window.showToast(
          `Lamaran terkirim! Lampiran: ${result.data.attachedFileName} (${result.data.attachedSizeKB} KB).`
        );
        setTimeout(() => window.location.reload(), 900);
      } else {
        window.showToast(result.message || 'Gagal mengirim lamaran.', 'error');
      }
    } catch (err) {
      window.showToast('Terjadi kesalahan jaringan saat mengirim lamaran.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Pemicu Pindai Lowongan AI (Dengan Skeleton-to-Content Shimmer)
  document.querySelectorAll('[data-trigger-scan]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (queueListEl && queueSkeletonEl) {
        queueListEl.classList.add('hidden');
        queueSkeletonEl.classList.remove('hidden');
      }
      window.showToast('Memulai pemindaian AI lintas platform...');

      try {
        const res = await fetch('/api/scanner/run', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          window.showToast(data.message);
          setTimeout(() => window.location.reload(), 800);
        } else {
          window.showToast(data.message || 'Pemindaian gagal.', 'error');
        }
      } catch (err) {
        window.showToast('Gagal menghubungi layanan pemindai.', 'error');
      } finally {
        if (queueListEl && queueSkeletonEl) {
          queueSkeletonEl.classList.add('hidden');
          queueListEl.classList.remove('hidden');
        }
      }
    });
  });

  // ==========================================================================
  // MODAL INPUT CEPAT (QUICK CAPTURE: URL, TEKS & CTRL+V SCREENSHOT POSTER)
  // ==========================================================================
  const qcModal = document.getElementById('quickCaptureModal');
  let qcCaptureType = 'text';
  let pastedImageFile = null;

  document.querySelectorAll('[data-open-quick-capture]').forEach((btn) => {
    btn.addEventListener('click', () => {
      qcModal?.classList.remove('hidden');
    });
  });

  document.querySelectorAll('[data-close-quick-capture]').forEach((btn) => {
    btn.addEventListener('click', () => {
      qcModal?.classList.add('hidden');
    });
  });

  document.querySelectorAll('[data-qc-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      qcCaptureType = tab.getAttribute('data-qc-tab');
      document.querySelectorAll('[data-qc-tab]').forEach((t) => {
        t.classList.remove('bg-[#C6601F]', 'text-[#EADCC8]');
        t.classList.add('bg-[#0A0F14]', 'text-[#7FB3B8]');
      });
      tab.classList.remove('bg-[#0A0F14]', 'text-[#7FB3B8]');
      tab.classList.add('bg-[#C6601F]', 'text-[#EADCC8]');

      document.getElementById('qcUrlPanel').classList.toggle('hidden', qcCaptureType !== 'url');
      document.getElementById('qcTextPanel').classList.toggle('hidden', qcCaptureType !== 'text');
      document.getElementById('qcImagePanel').classList.toggle('hidden', qcCaptureType !== 'image');
    });
  });

  // Dukungan Paste Gambar langsung dari Clipboard (Ctrl+V)
  window.addEventListener('paste', (e) => {
    if (!qcModal || qcModal.classList.contains('hidden')) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          pastedImageFile = blob;
          qcCaptureType = 'image';
          document.querySelector('[data-qc-tab="image"]')?.click();
          const previewImg = document.getElementById('qcImagePreview');
          previewImg.src = URL.createObjectURL(blob);
          previewImg.classList.remove('hidden');
          window.showToast('Gambar poster dari clipboard (Ctrl+V) siap diproses Vision OCR!');
        }
      }
    }
  });

  document.getElementById('qcPosterInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      pastedImageFile = file;
      const previewImg = document.getElementById('qcImagePreview');
      previewImg.src = URL.createObjectURL(file);
      previewImg.classList.remove('hidden');
    }
  });

  document.getElementById('submitQuickCaptureBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('submitQuickCaptureBtn');
    btn.disabled = true;
    btn.textContent = 'Memproses Vision OCR & AI...';

    try {
      const formData = new FormData();
      formData.append('captureType', qcCaptureType);
      formData.append('sourcePlatform', document.getElementById('qcSourcePlatform').value);

      if (qcCaptureType === 'url') {
        formData.append('rawInput', document.getElementById('qcUrlInput').value);
      } else if (qcCaptureType === 'text') {
        formData.append('rawInput', document.getElementById('qcTextInput').value);
      } else if (qcCaptureType === 'image') {
        if (!pastedImageFile) {
          window.showToast('Pilih gambar atau tekan Ctrl+V terlebih dahulu.', 'error');
          btn.disabled = false;
          btn.textContent = 'Proses dengan AI Sekarang';
          return;
        }
        formData.append('posterImage', pastedImageFile, pastedImageFile.name || 'poster.png');
        formData.append('rawInput', document.getElementById('qcImageCaption').value || '');
      }

      const res = await fetch('/api/jobs/quick-capture', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (result.success) {
        window.showToast(`Draf selesai dibuat! Skor kecocokan AI: ${result.data.matchScore}%`);
        setTimeout(() => window.location.reload(), 700);
      } else {
        window.showToast(result.message || 'Gagal memproses Quick Capture.', 'error');
      }
    } catch (err) {
      window.showToast('Terjadi kesalahan saat mengirim data Quick Capture.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Proses dengan AI Sekarang';
    }
  });

  // Inisialisasi awal
  renderDraftQueue();
  if (selectedDraftId) {
    populateDraftEditor(selectedDraftId);
  }
});