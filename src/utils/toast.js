/**
 * Sistema de notificaciones Toast con curvas ease-out (Emil Kowalski) e iconos SVG limpios
 */

const ICONS = {
  success: `<svg class="w-4 h-4 shrink-0 text-[#86efac]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
  info: `<svg class="w-4 h-4 shrink-0 text-[#D795B7]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  warning: `<svg class="w-4 h-4 shrink-0 text-[#fcd34d]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
  error: `<svg class="w-4 h-4 shrink-0 text-[#fda4af]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
}

export function showToast(message, type = 'info', duration = 3800) {
  const container = document.getElementById('toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.setAttribute('role', 'status')
  toast.className =
    'toast-item flex items-center gap-3 px-4 py-3 rounded-xl bg-[#161014] border border-[#D795B7]/30 text-[#f7f5f4] text-xs font-medium shadow-xl'

  toast.innerHTML = `
    ${ICONS[type] || ICONS.info}
    <span class="leading-snug flex-1">${message}</span>
    <button type="button" aria-label="Cerrar notificación" class="text-[#c9a3b1] hover:text-[#f7f5f4] p-1 cursor-pointer">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `

  const closeBtn = toast.querySelector('button')
  const dismiss = () => {
    toast.classList.add('toast-leave')
    setTimeout(() => toast.remove(), 200)
  }

  closeBtn?.addEventListener('click', dismiss)
  container.appendChild(toast)

  setTimeout(dismiss, duration)
}
