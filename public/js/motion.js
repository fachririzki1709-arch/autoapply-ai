document.addEventListener('DOMContentLoaded', () => {
  // 1. Staggered Bento Entrance (55ms delay per kartu, 40ms initial delay)
  const bentoCards = document.querySelectorAll('[data-bento-card]');
  bentoCards.forEach((card, index) => {
    card.style.animationDelay = `${40 + index * 55}ms`;
    card.classList.add('bento-animate-in');
  });

  // 2. Live WIB Clock (Asia/Jakarta) pada Topbar & Sidebar
  function updateWibClocks() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\./g, ':');

    const dateStr = now.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    document.querySelectorAll('[data-wib-time]').forEach((el) => {
      el.textContent = `${timeStr} WIB`;
    });

    document.querySelectorAll('[data-wib-date]').forEach((el) => {
      el.textContent = dateStr;
    });
  }
  updateWibClocks();
  setInterval(updateWibClocks, 1000);

  // 3. Sidebar Accordion Drawer (Status Lamaran & Lowongan Kerja)
  document.querySelectorAll('[data-accordion-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-accordion-toggle');
      const content = document.getElementById(targetId);
      const chevron = btn.querySelector('[data-accordion-chevron]');
      if (!content) return;

      const isHidden = content.classList.contains('hidden');
      if (isHidden) {
        content.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      } else {
        content.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      }
    });
  });

  // 4. Circular SVG Ring Gauge Animation + Counter Roll-up (Kartu 3)
  const gaugeRing = document.getElementById('aiAccuracyRing');
  const gaugeCounter = document.getElementById('aiAccuracyCounter');
  if (gaugeRing && gaugeCounter) {
    const targetScore = parseFloat(gaugeRing.getAttribute('data-score') || '89.2');
    const circumference = 2 * Math.PI * 44; // r = 44
    gaugeRing.style.strokeDasharray = `${circumference}`;
    gaugeRing.style.strokeDashoffset = `${circumference}`;

    requestAnimationFrame(() => {
      setTimeout(() => {
        const offset = circumference - (Math.min(100, targetScore) / 100) * circumference;
        gaugeRing.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)';
        gaugeRing.style.strokeDashoffset = `${offset}`;
      }, 180);
    });

    // Counter roll-up
    const duration = 900;
    const startTime = performance.now();
    function animateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      gaugeCounter.textContent = `${(targetScore * eased).toFixed(1)}%`;
      if (progress < 1) requestAnimationFrame(animateCounter);
    }
    requestAnimationFrame(animateCounter);
  }

  // 5. Weekly Dual-Bar Chart ScaleY Entrance (Kartu 4)
  document.querySelectorAll('[data-bar-grow]').forEach((bar, idx) => {
    bar.style.transform = 'scaleY(0)';
    bar.style.transformOrigin = 'bottom';
    setTimeout(() => {
      bar.style.transition = 'transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)';
      bar.style.transform = 'scaleY(1)';
    }, 150 + idx * 45);
  });
});

// Helper Toast Notification
window.showToast = function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const isError = type === 'error';
  toast.className = `px-4 py-3 rounded-xl border text-xs font-medium shadow-xl backdrop-blur-md transition-all duration-300 ${
    isError
      ? 'bg-red-950/90 border-red-500/50 text-red-200'
      : 'bg-[#0F3D3E]/95 border-[#7FB3B8]/40 text-[#EADCC8]'
  }`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4200);
};