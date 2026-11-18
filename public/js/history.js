document.addEventListener('DOMContentLoaded', () => {
  // Filter Tahapan Seleksi
  document.querySelectorAll('[data-history-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-history-filter');
      document.querySelectorAll('[data-history-filter]').forEach((b) => {
        b.classList.remove('bg-[#C6601F]', 'text-[#EADCC8]');
        b.classList.add('bg-[#0A0F14]', 'text-[#7FB3B8]');
      });
      btn.classList.remove('bg-[#0A0F14]', 'text-[#7FB3B8]');
      btn.classList.add('bg-[#C6601F]', 'text-[#EADCC8]');

      document.querySelectorAll('[data-history-row]').forEach((row) => {
        const stage = row.getAttribute('data-stage');
        const followup = row.getAttribute('data-followup') === 'true';
        const show =
          filter === 'all'
            ? true
            : filter === 'followup'
            ? followup
            : stage === filter;
        row.classList.toggle('hidden', !show);
      });
    });
  });

  // Modal Pembaruan Tahapan & Jadwal Wawancara
  const modal = document.getElementById('stageModal');
  document.querySelectorAll('[data-open-stage-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('stageDraftId').value = btn.getAttribute('data-id');
      document.getElementById('stageModalJobTitle').textContent = btn.getAttribute('data-title');
      document.getElementById('stageSelect').value = btn.getAttribute('data-stage');
      document.getElementById('interviewDateInput').value = btn.getAttribute('data-interview-date') || '';
      document.getElementById('interviewNotesInput').value = btn.getAttribute('data-interview-notes') || '';
      modal?.classList.remove('hidden');
    });
  });

  document.getElementById('closeStageModal')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  document.getElementById('stageUpdateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('stageDraftId').value;
    const res = await fetch(`/api/drafts/${id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationStage: document.getElementById('stageSelect').value,
        interviewDate: document.getElementById('interviewDateInput').value || null,
        interviewNotes: document.getElementById('interviewNotesInput').value,
      }),
    });
    const data = await res.json();
    if (data.success) {
      window.showToast(data.message);
      setTimeout(() => window.location.reload(), 600);
    } else {
      window.showToast(data.message || 'Gagal memperbarui status.', 'error');
    }
  });
});