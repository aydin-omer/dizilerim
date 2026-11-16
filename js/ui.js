// Küçük arayüz yardımcıları: HTML kaçışı, bildirim (toast), alt menü (sheet), ikonlar.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let toastTimer;
export function toast(message, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  el.classList.add('show');
  const hide = () => el.classList.remove('show');
  if (action) {
    el.querySelector('button').onclick = () => {
      hide();
      action.run();
    };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 5000 : 2500);
}

/** Alttan açılan seçim penceresi. Seçilen butonun `value` değeriyle resolve olur (dışarı dokunulursa null). */
export function sheet({ title, message, buttons }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    document.getElementById('toast').classList.remove('show'); // bildirim butonları kapatmasın
    root.innerHTML = `
      <div class="backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true">
        ${title ? `<h3>${esc(title)}</h3>` : ''}
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="sheet-buttons">
          ${buttons.map((b, i) => `<button type="button" class="btn ${b.style || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    requestAnimationFrame(() => root.classList.add('open'));
    const close = (v) => {
      root.classList.remove('open');
      setTimeout(() => (root.innerHTML = ''), 200);
      resolve(v);
    };
    root.querySelector('.backdrop').onclick = () => close(null);
    root.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => close(buttons[+b.dataset.i].value)));
  });
}

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icon = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  tv: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 2.5l4 3.5 4-3.5"/>'),
};
