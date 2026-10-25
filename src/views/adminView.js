import { supabase } from '../supabase'
import { showToast } from '../utils/toast'
import { playNewBookingSound } from '../utils/audio'
import {
  generateBookingCode,
  formatTime12h,
  evaluateGraceStatus,
  formatDateSpanish,
  formatPriceSlot,
  extractContactInfo,
  serializeClientMeta,
  buildWhatsAppLink,
  buildEmailLink,
} from '../utils/formatters'
import { exportAppointmentsToCSV, printBookingTicket } from '../utils/exportUtils'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '1234'

export function renderAdminView(container) {
  const isAuthorized = sessionStorage.getItem('iso_admin_auth') === 'true'
  if (!isAuthorized) {
    return renderAdminLogin(container)
  }
  return renderAdminDashboard(container)
}

// ============================================================================
// 1. LOGIN ÚNICO DE LA ADMINISTRADORA (ESTHER)
// ============================================================================
function renderAdminLogin(container) {
  let enteredPin = ''

  container.innerHTML = `
    <div class="animate-view-enter min-h-[calc(100vh-4.5rem)] flex items-center justify-center p-6">
      <div class="iso-card max-w-sm w-full p-8 sm:p-10 border border-[#D795B7]/35 flex flex-col items-center text-center">
        
        <div class="w-16 h-16 rounded-full bg-[#141114] border border-[#D795B7]/55 flex items-center justify-center mb-5 overflow-hidden shadow-lg">
          <img src="/logo-pink-clean.png" alt="ISO Estudio Admin" class="w-12 h-12 object-contain" />
        </div>

        <span class="text-[10px] uppercase tracking-[0.22em] text-[#D795B7] font-semibold">
          Acceso Exclusivo • Esther
        </span>
        <h1 class="font-serif-editorial text-3xl text-[#f7f5f4] mt-1.5">
          Panel ISO Estudio
        </h1>
        <p class="text-xs text-[#c9a3b1] mt-2 leading-relaxed">
          Ingresa tu código de 4 dígitos para administrar tus solicitudes, citas e historial.
        </p>

        <div id="pin-dots" class="flex items-center gap-4 my-7" aria-live="polite">
          <span class="pin-dot w-3.5 h-3.5 rounded-full border border-[#D795B7]/50 transition-transform duration-150"></span>
          <span class="pin-dot w-3.5 h-3.5 rounded-full border border-[#D795B7]/50 transition-transform duration-150"></span>
          <span class="pin-dot w-3.5 h-3.5 rounded-full border border-[#D795B7]/50 transition-transform duration-150"></span>
          <span class="pin-dot w-3.5 h-3.5 rounded-full border border-[#D795B7]/50 transition-transform duration-150"></span>
        </div>

        <div id="pin-error" class="h-5 mb-2 text-xs text-[#fda4af] font-medium opacity-0 transition-opacity">
          Código incorrecto. Intenta nuevamente.
        </div>

        <div class="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map(
              (num) => `
            <button
              type="button"
              data-key="${num}"
              class="btn-numpad btn-iso-secondary h-14 rounded-xl font-mono-code text-lg font-medium text-[#f7f5f4] flex items-center justify-center cursor-pointer select-none"
            >
              ${num}
            </button>
          `
            )
            .join('')}
          <button
            type="button"
            data-key="clear"
            class="btn-numpad btn-iso-secondary h-14 rounded-xl text-[11px] uppercase tracking-wider font-medium text-[#c9a3b1] hover:text-[#f7f5f4] flex items-center justify-center cursor-pointer select-none"
          >
            Limpiar
          </button>
          <button
            type="button"
            data-key="0"
            class="btn-numpad btn-iso-secondary h-14 rounded-xl font-mono-code text-lg font-medium text-[#f7f5f4] flex items-center justify-center cursor-pointer select-none"
          >
            0
          </button>
          <button
            type="button"
            data-key="backspace"
            aria-label="Borrar último dígito"
            class="btn-numpad btn-iso-secondary h-14 rounded-xl text-sm font-medium text-[#c9a3b1] hover:text-[#f7f5f4] flex items-center justify-center cursor-pointer select-none"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `

  const dots = container.querySelectorAll('.pin-dot')
  const errorEl = container.querySelector('#pin-error')

  function updateDots() {
    dots.forEach((dot, idx) => {
      if (idx < enteredPin.length) {
        dot.classList.add('bg-[#D795B7]', 'scale-110')
      } else {
        dot.classList.remove('bg-[#D795B7]', 'scale-110')
      }
    })
  }

  function handleKeyInput(key) {
    errorEl?.classList.add('opacity-0')

    if (key === 'clear') {
      enteredPin = ''
      updateDots()
      return
    }
    if (key === 'backspace') {
      enteredPin = enteredPin.slice(0, -1)
      updateDots()
      return
    }
    if (/^\d$/.test(key) && enteredPin.length < 4) {
      enteredPin += key
      updateDots()

      if (enteredPin.length === 4) {
        if (enteredPin === ADMIN_PIN) {
          sessionStorage.setItem('iso_admin_auth', 'true')
          showToast('Bienvenida Esther al panel de ISO Estudio', 'success')
          renderAdminView(container)
        } else {
          errorEl?.classList.remove('opacity-0')
          setTimeout(() => {
            enteredPin = ''
            updateDots()
          }, 350)
        }
      }
    }
  }

  container.querySelectorAll('.btn-numpad').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key')
      if (key) handleKeyInput(key)
    })
  })

  function onKeyDown(e) {
    if (e.key >= '0' && e.key <= '9') handleKeyInput(e.key)
    else if (e.key === 'Backspace') handleKeyInput('backspace')
    else if (e.key === 'Escape') handleKeyInput('clear')
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}

// ============================================================================
// 2. DASHBOARD DE ESTHER — 4 SECCIONES ESPACIOSAS Y SENCILLAS
//    1) Agenda Activa (Solo nuevas solicitudes pendientes por aceptar)
//    2) Citas (Citas aceptadas en desarrollo)
//    3) Historial de Citas (Terminadas y Rechazadas)
//    4) Sesiones, Gracia y Precios
// ============================================================================
function renderAdminDashboard(container) {
  let appointments = []
  let services = []
  let activeTab = 'solicitudes' // 'solicitudes' | 'citas' | 'historial' | 'tarifas'
  let historySubFilter = 'todas' // 'todas' | 'completadas' | 'rechazadas'
  let searchQuery = ''
  let openNoteEditorId = null
  let activeVoucherAppointment = null
  let rejectingAppointment = null
  let refreshTimer = null

  const todayStr = new Date().toISOString().split('T')[0]

  container.innerHTML = `
    <div class="animate-view-enter max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-12 space-y-10">
      
      <!-- Encabezado Amplio y Limpio -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-[#f7f5f4]/10 pb-8">
        <div class="space-y-2">
          <div class="flex items-center gap-2.5">
            <span class="w-2 h-2 rounded-full bg-[#86efac]"></span>
            <span class="text-[11px] uppercase tracking-[0.2em] text-[#D795B7] font-semibold">
              Administración ISO Estudio
            </span>
          </div>
          <h1 class="font-serif-editorial text-3xl sm:text-5xl text-[#f7f5f4] font-semibold tracking-wide">
            Hola, Esther
          </h1>
          <p class="text-sm text-[#c9a3b1]">
            Selecciona una sección abajo para revisar pagos nuevos, atender citas aceptadas o consultar tu historial.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            id="btn-new-manual"
            class="btn-iso-primary px-5 py-2.5 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Agendar Cita Manual</span>
          </button>

          <button
            type="button"
            id="btn-export-csv"
            class="btn-iso-secondary px-4 py-2.5 text-xs font-medium flex items-center gap-2 cursor-pointer"
            title="Descargar todo en Excel (CSV)"
          >
            <span>Exportar Excel</span>
          </button>

          <button
            type="button"
            id="btn-lock-admin"
            class="btn-iso-secondary px-4 py-2.5 text-xs text-[#c9a3b1] hover:text-[#f7f5f4] cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      <!-- Navegación en 4 Tarjetas Grandes y Espaciosas (Cada una es una Sección) -->
      <nav aria-label="Secciones del panel" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <!-- SECCIÓN 1: Agenda Activa (Nuevas Solicitudes por Aceptar) -->
        <button
          type="button"
          data-tab="solicitudes"
          class="tab-card text-left p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between min-h-[116px]"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs uppercase tracking-[0.14em] text-[#fcd34d] font-semibold">
              1. Agenda Activa
            </span>
            <span id="badge-count-solicitudes" class="font-serif-editorial text-3xl text-[#f7f5f4] font-semibold tabular-nums">
              0
            </span>
          </div>
          <p class="text-xs text-[#c9a3b1] mt-3 leading-relaxed">
            Solicitudes nuevas pendientes por verificar pago del 50%.
          </p>
        </button>

        <!-- SECCIÓN 2: Citas (Aceptadas y en Desarrollo) -->
        <button
          type="button"
          data-tab="citas"
          class="tab-card text-left p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between min-h-[116px]"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs uppercase tracking-[0.14em] text-[#86efac] font-semibold">
              2. Citas
            </span>
            <span id="badge-count-citas" class="font-serif-editorial text-3xl text-[#f7f5f4] font-semibold tabular-nums">
              0
            </span>
          </div>
          <p class="text-xs text-[#c9a3b1] mt-3 leading-relaxed">
            Citas ya aceptadas que están próximas o en desarrollo hoy.
          </p>
        </button>

        <!-- SECCIÓN 3: Historial de Citas (Terminadas y Rechazadas) -->
        <button
          type="button"
          data-tab="historial"
          class="tab-card text-left p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between min-h-[116px]"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs uppercase tracking-[0.14em] text-[#E3B8D0] font-semibold">
              3. Historial de Citas
            </span>
            <span id="badge-count-historial" class="font-serif-editorial text-3xl text-[#f7f5f4] font-semibold tabular-nums">
              0
            </span>
          </div>
          <p class="text-xs text-[#c9a3b1] mt-3 leading-relaxed">
            Sesiones completadas terminadas y registro de rechazadas.
          </p>
        </button>

        <!-- SECCIÓN 4: Sesiones, Gracia y Precios -->
        <button
          type="button"
          data-tab="tarifas"
          class="tab-card text-left p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between min-h-[116px]"
        >
          <div class="flex items-center justify-between w-full">
            <span class="text-xs uppercase tracking-[0.14em] text-[#D795B7] font-semibold">
              4. Sesiones y Precios
            </span>
            <span class="font-serif-editorial text-2xl text-[#c9a3b1] font-semibold">
              3
            </span>
          </div>
          <p class="text-xs text-[#c9a3b1] mt-3 leading-relaxed">
            Configurar tarifas y minutos de gracia (20 o 30 min).
          </p>
        </button>
      </nav>

      <!-- Cabecera de la Sección Activa + Buscador Limpio -->
      <div id="section-header-bar" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <h2 id="section-title" class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4]">
            Nuevas Solicitudes Pendientes por Aceptar
          </h2>
          <p id="section-subtitle" class="text-xs sm:text-sm text-[#c9a3b1] mt-1">
            Revisa la captura de la transferencia del 50% y acepta o rechaza la solicitud.
          </p>
        </div>

        <div id="search-filter-bar" class="w-full sm:w-72">
          <input
            type="search"
            id="search-input"
            placeholder="Buscar cliente, teléfono o código..."
            class="iso-input text-xs"
          />
        </div>
      </div>

      <!-- Sub-filtro exclusivo para la sección 3 (Historial de Citas) -->
      <div id="history-subfilters" class="hidden flex-wrap items-center gap-2.5">
        <button
          type="button"
          data-hfilter="todas"
          class="hfilter-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer bg-[#1f151a] text-[#f7f5f4] border border-[#D795B7]/45"
        >
          Todas las del Historial
        </button>
        <button
          type="button"
          data-hfilter="completadas"
          class="hfilter-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer bg-[#141114] text-[#c9a3b1] border border-[#f7f5f4]/10 hover:text-[#f7f5f4]"
        >
          Solo Terminadas / Completadas
        </button>
        <button
          type="button"
          data-hfilter="rechazadas"
          class="hfilter-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer bg-[#141114] text-[#c9a3b1] border border-[#f7f5f4]/10 hover:text-[#f7f5f4]"
        >
          Solo Rechazadas / No asistió
        </button>
      </div>

      <!-- Listado Espacioso de Tarjetas -->
      <div id="admin-tab-content" class="space-y-6"></div>

      <!-- ================================================================== -->
      <!-- VISOR EN GRANDE DEL COMPROBANTE DE TRANSFERENCIA 50% PARA ESTHER   -->
      <!-- ================================================================== -->
      <div
        id="voucher-viewer-modal"
        class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
      >
        <div class="iso-card max-w-2xl w-full p-6 sm:p-8 border border-[#D795B7]/45 space-y-5 max-h-[94vh] overflow-y-auto animate-view-enter">
          <div class="flex items-start justify-between gap-3 border-b border-[#f7f5f4]/10 pb-4">
            <div>
              <span class="text-[10px] uppercase tracking-[0.2em] text-[#D795B7] font-semibold block">
                Comprobante de Transferencia del 50%
              </span>
              <h3 id="voucher-modal-client" class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4] mt-1"></h3>
              <p id="voucher-modal-meta" class="text-xs text-[#c9a3b1] mt-1"></p>
            </div>
            <button
              type="button"
              id="btn-close-voucher-modal"
              class="btn-iso-secondary w-9 h-9 flex items-center justify-center cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div class="bg-[#0a0a0a] border border-[#f7f5f4]/10 rounded-xl p-4 flex items-center justify-center">
            <img
              id="voucher-modal-img"
              src=""
              alt="Comprobante de transferencia 50%"
              class="max-h-[58vh] w-auto object-contain rounded-lg"
            />
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#f7f5f4]/10">
            <a
              id="btn-download-voucher"
              href="#"
              download="comprobante-50-isostudio.jpg"
              class="btn-iso-secondary px-4 py-2.5 text-xs font-medium"
            >
              Descargar Imagen
            </a>

            <div id="voucher-modal-actions" class="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                id="btn-reject-from-modal"
                class="btn-iso-secondary px-4 py-2.5 text-xs font-medium text-[#fda4af] cursor-pointer"
              >
                Rechazar Solicitud
              </button>
              <button
                type="button"
                id="btn-approve-from-modal"
                class="btn-iso-primary px-6 py-2.5 text-xs font-medium cursor-pointer"
              >
                Aceptar Cita (Pasar a Citas)
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- MODAL DE MOTIVO DE RECHAZO (ENVÍA AL HISTORIAL CON RAZÓN Y NOTA)   -->
      <!-- ================================================================== -->
      <div
        id="reject-reason-modal"
        class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
      >
        <div class="iso-card max-w-md w-full p-6 sm:p-8 border border-[#fda4af]/40 space-y-5 animate-view-enter">
          <div class="flex items-start justify-between gap-3 border-b border-[#f7f5f4]/10 pb-4">
            <div>
              <span class="text-[10px] uppercase tracking-[0.2em] text-[#fda4af] font-semibold block">
                Archivar en Historial
              </span>
              <h3 class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4] mt-1">
                Rechazar Solicitud
              </h3>
              <p id="reject-modal-client" class="text-xs text-[#c9a3b1] mt-1"></p>
            </div>
            <button
              type="button"
              id="btn-close-reject-modal"
              class="btn-iso-secondary w-9 h-9 flex items-center justify-center cursor-pointer"
            >
              &times;
            </button>
          </div>

          <form id="reject-reason-form" class="space-y-4 text-xs">
            <div>
              <label for="reject-reason-select" class="block text-[#f7f5f4] font-medium mb-1.5">
                Selecciona el motivo del rechazo *
              </label>
              <select
                id="reject-reason-select"
                name="reason_option"
                required
                class="iso-input cursor-pointer"
              >
                <option value="Comprobante o imagen de pago no adecuado">
                  Comprobante o imagen de pago no adecuado
                </option>
                <option value="Cliente cambió de opinión">
                  Cliente cambió de opinión
                </option>
                <option value="Cita por error">
                  Cita por error
                </option>
                <option value="Prueba">
                  Prueba
                </option>
                <option value="Otro motivo">
                  Otro motivo (especificar en la nota)
                </option>
              </select>
            </div>

            <div>
              <label for="reject-reason-note" class="block text-[#f7f5f4] font-medium mb-1.5">
                Nota o detalle adicional <span class="text-[#c9a3b1] font-normal">(Opcional)</span>
              </label>
              <textarea
                id="reject-reason-note"
                name="reason_note"
                rows="3"
                placeholder="Ej. Subió una captura borrosa o el pago aún no se refleja..."
                class="iso-input resize-none"
              ></textarea>
            </div>

            <p class="text-[11px] text-[#c9a3b1] leading-relaxed">
              Esta solicitud no se borrará: pasará a <strong class="text-[#f7f5f4]">3. Historial de Citas</strong> con este motivo guardado (desde allí podrás eliminarla si lo deseas).
            </p>

            <div class="pt-3 border-t border-[#f7f5f4]/10 flex items-center justify-end gap-3">
              <button
                type="button"
                id="btn-cancel-reject-modal"
                class="btn-iso-secondary px-4 py-2.5 text-xs cursor-pointer"
              >
                Volver
              </button>
              <button
                type="submit"
                class="btn-iso-secondary px-5 py-2.5 text-xs font-semibold text-[#fda4af] border-[#fda4af]/50 hover:bg-[#fda4af]/15 cursor-pointer"
              >
                Confirmar Rechazo
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal para Agendar Cita Manual -->
      <div
        id="manual-booking-modal"
        class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
      >
        <div class="iso-card max-w-lg w-full p-6 sm:p-8 border border-[#D795B7]/35 space-y-5 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b border-[#f7f5f4]/10 pb-4">
            <div>
              <span class="text-[10px] uppercase tracking-[0.2em] text-[#D795B7] font-semibold block">
                Registro Directo de Esther
              </span>
              <h3 class="font-serif-editorial text-2xl text-[#f7f5f4] mt-0.5">
                Agendar Cita Manualmente
              </h3>
            </div>
            <button type="button" id="btn-close-manual" class="btn-iso-secondary w-9 h-9 flex items-center justify-center cursor-pointer">
              &times;
            </button>
          </div>

          <form id="manual-booking-form" class="space-y-4 text-xs">
            <div>
              <label class="block text-[#f7f5f4] font-medium mb-1.5">Nombre completo *</label>
              <input type="text" name="client_name" required placeholder="Nombre de la clienta o cliente" class="iso-input" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">Tipo de sesión y plan *</label>
                <select name="service_name" class="iso-input cursor-pointer">
                  <option value="Foto Navideña — Plan Temporada">Foto Navideña — Plan Temporada (RD$ 3,500)</option>
                  <option value="Infantil — Plan Estándar">Infantil (Niños) — Plan Estándar (RD$ 1,900)</option>
                  <option value="Infantil — Plan Premium">Infantil (Niños) — Plan Premium (RD$ 3,200)</option>
                  <option value="Retrato — Plan Básico">Retrato — Plan Básico (RD$ 1,600)</option>
                  <option value="Retrato — Plan Estándar">Retrato — Plan Estándar (RD$ 2,800)</option>
                  <option value="Retrato — Plan Premium">Retrato — Plan Premium (RD$ 4,800)</option>
                </select>
              </div>
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">¿Cuántas personas? *</label>
                <input type="number" name="people_count" min="1" max="20" value="2" required class="iso-input font-mono-code" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">Teléfono (+1 WhatsApp / Llamada) *</label>
                <input type="tel" name="client_phone" required placeholder="+1 809-000-0000" class="iso-input font-mono-code" />
              </div>
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">Correo electrónico (Opcional)</label>
                <input type="email" name="client_email" placeholder="cliente@ejemplo.com" class="iso-input" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">Fecha *</label>
                <input type="date" name="appointment_date" value="${todayStr}" required class="iso-input font-mono-code" />
              </div>
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">Hora *</label>
                <input type="time" name="appointment_time" value="17:00" required class="iso-input font-mono-code" />
              </div>
              <div>
                <label class="block text-[#f7f5f4] font-medium mb-1.5">¿Dónde guardarla?</label>
                <select name="status" class="iso-input cursor-pointer">
                  <option value="confirmada">En 2. Citas (Aceptada)</option>
                  <option value="completada">En 3. Historial (Terminada)</option>
                </select>
              </div>
            </div>
            <p class="text-[11px] text-[#c9a3b1]">
              Horario del estudio: <strong class="text-[#f7f5f4]">Lunes a Viernes 5:00 PM – 8:00 PM</strong> | <strong class="text-[#E3B8D0]">Domingos 8:00 AM – 5:00 PM</strong>
            </p>

            <div class="pt-4 border-t border-[#f7f5f4]/10 flex justify-end gap-3">
              <button type="button" id="btn-cancel-manual" class="btn-iso-secondary px-4 py-2 text-xs cursor-pointer">
                Cancelar
              </button>
              <button type="submit" class="btn-iso-primary px-6 py-2 text-xs font-medium cursor-pointer">
                Guardar Cita
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `

  const tabContent = container.querySelector('#admin-tab-content')
  const searchInput = container.querySelector('#search-input')
  const searchBar = container.querySelector('#search-filter-bar')
  const sectionTitle = container.querySelector('#section-title')
  const sectionSubtitle = container.querySelector('#section-subtitle')
  const historySubFiltersBar = container.querySelector('#history-subfilters')

  const badgeSolicitudes = container.querySelector('#badge-count-solicitudes')
  const badgeCitas = container.querySelector('#badge-count-citas')
  const badgeHistorial = container.querySelector('#badge-count-historial')

  const manualModal = container.querySelector('#manual-booking-modal')
  const manualForm = container.querySelector('#manual-booking-form')

  const voucherModal = container.querySelector('#voucher-viewer-modal')
  const voucherModalClient = container.querySelector('#voucher-modal-client')
  const voucherModalMeta = container.querySelector('#voucher-modal-meta')
  const voucherModalImg = container.querySelector('#voucher-modal-img')
  const voucherModalActions = container.querySelector('#voucher-modal-actions')
  const btnDownloadVoucher = container.querySelector('#btn-download-voucher')
  const btnCloseVoucherModal = container.querySelector('#btn-close-voucher-modal')
  const btnApproveFromModal = container.querySelector('#btn-approve-from-modal')
  const btnRejectFromModal = container.querySelector('#btn-reject-from-modal')

  const rejectReasonModal = container.querySelector('#reject-reason-modal')
  const rejectReasonForm = container.querySelector('#reject-reason-form')
  const rejectModalClient = container.querySelector('#reject-modal-client')
  const rejectReasonSelect = container.querySelector('#reject-reason-select')
  const rejectReasonNote = container.querySelector('#reject-reason-note')
  const btnCloseRejectModal = container.querySelector('#btn-close-reject-modal')
  const btnCancelRejectModal = container.querySelector('#btn-cancel-reject-modal')

  function openRejectModal(appointment) {
    if (!appointment) return
    rejectingAppointment = appointment
    if (rejectModalClient) {
      rejectModalClient.textContent = `${appointment.client_name} (${appointment.booking_code}) • ${appointment.service_name}`
    }

    const rawNote = (appointment.admin_notes || '').trim()
    const [savedReason, ...savedCommentParts] = rawNote.split(' — ')
    const savedComment = savedCommentParts.join(' — ').trim()

    if (rejectReasonSelect) {
      const validOptions = Array.from(rejectReasonSelect.options).map((o) => o.value)
      rejectReasonSelect.value = validOptions.includes(savedReason)
        ? savedReason
        : 'Comprobante o imagen de pago no adecuado'
    }
    if (rejectReasonNote) {
      rejectReasonNote.value = savedComment || ''
    }
    rejectReasonModal?.classList.remove('hidden')
  }

  function updateSectionCountsAndStyles() {
    const solicitudesCount = appointments.filter((a) => a.status === 'pendiente').length
    const citasCount = appointments.filter(
      (a) => a.status === 'confirmada' || a.status === 'en_estudio'
    ).length
    const historialCount = appointments.filter((a) =>
      ['completada', 'cancelada', 'no_asistio'].includes(a.status)
    ).length

    if (badgeSolicitudes) badgeSolicitudes.textContent = String(solicitudesCount)
    if (badgeCitas) badgeCitas.textContent = String(citasCount)
    if (badgeHistorial) badgeHistorial.textContent = String(historialCount)

    container.querySelectorAll('.tab-card').forEach((card) => {
      const tab = card.getAttribute('data-tab')
      const isSelected = tab === activeTab
      card.className = `tab-card text-left p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between min-h-[116px] ${
        isSelected
          ? 'bg-[#1f151a] border-[#D795B7] shadow-[0_0_0_1px_rgba(215,149,183,0.3)]'
          : 'bg-[#161014] border-[#f7f5f4]/10 hover:bg-[#1f151a]/60 hover:border-[#D795B7]/35'
      }`
    })

    const headerMeta = {
      solicitudes: {
        title: '1. Agenda Activa — Solicitudes por Aceptar',
        sub: 'Aquí solo aparecen las reservas nuevas que esperan que verifiques su transferencia del 50%.',
      },
      citas: {
        title: '2. Citas Aceptadas en Desarrollo',
        sub: 'Citas confirmadas listas para responder al cliente, marcar llegada a tiempo o finalizar sesión.',
      },
      historial: {
        title: '3. Historial de Citas',
        sub: 'Archivo de sesiones completadas y solicitudes rechazadas o inasistencias.',
      },
      tarifas: {
        title: '4. Configuración de Sesiones, Gracia y Precios',
        sub: 'Ajusta el tiempo de gracia (20 o 30 minutos) y las tarifas de cada tipo de sesión.',
      },
    }

    const currentMeta = headerMeta[activeTab] || headerMeta.solicitudes
    if (sectionTitle) sectionTitle.textContent = currentMeta.title
    if (sectionSubtitle) sectionSubtitle.textContent = currentMeta.sub
  }

  function renderActiveTab() {
    if (!tabContent) return
    updateSectionCountsAndStyles()

    if (activeTab === 'tarifas') {
      searchBar?.classList.add('hidden')
      historySubFiltersBar?.classList.add('hidden')
      historySubFiltersBar?.classList.remove('flex')
      renderServicesConfigTab()
      return
    }

    searchBar?.classList.remove('hidden')

    if (activeTab === 'historial') {
      historySubFiltersBar?.classList.remove('hidden')
      historySubFiltersBar?.classList.add('flex')
    } else {
      historySubFiltersBar?.classList.add('hidden')
      historySubFiltersBar?.classList.remove('flex')
    }

    const baseList = appointments.filter((a) => {
      if (activeTab === 'solicitudes') {
        return a.status === 'pendiente'
      }
      if (activeTab === 'citas') {
        return a.status === 'confirmada' || a.status === 'en_estudio'
      }
      // Pestaña 3: Historial
      if (historySubFilter === 'completadas') return a.status === 'completada'
      if (historySubFilter === 'rechazadas') {
        return a.status === 'cancelada' || a.status === 'no_asistio'
      }
      return ['completada', 'cancelada', 'no_asistio'].includes(a.status)
    })

    const filtered = baseList.filter((a) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      const { email, phone, referenceNote } = extractContactInfo(a)
      return (
        (a.client_name || '').toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        phone.toLowerCase().includes(q) ||
        referenceNote.toLowerCase().includes(q) ||
        (a.service_name || '').toLowerCase().includes(q) ||
        (a.booking_code || '').toLowerCase().includes(q) ||
        (a.admin_notes || '').toLowerCase().includes(q)
      )
    })

    if (filtered.length === 0) {
      const emptyMessages = {
        solicitudes: {
          title: 'No tienes solicitudes pendientes por revisar',
          desc: 'Cuando un cliente reserve en la web y suba su comprobante del 50%, aparecerá aquí para que la aceptes o rechaces.',
        },
        citas: {
          title: 'No hay citas aceptadas en curso',
          desc: 'Cuando aceptes una solicitud en la pestaña 1 (o agendes una cita manual), pasará automáticamente a esta sección.',
        },
        historial: {
          title: 'No hay registros en esta vista del historial',
          desc: 'Las citas que finalices y las que rechaces se guardarán aquí ordenadamente.',
        },
      }
      const msg = emptyMessages[activeTab] || emptyMessages.solicitudes

      tabContent.innerHTML = `
        <div class="iso-card p-12 text-center space-y-3">
          <p class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4]">
            ${msg.title}
          </p>
          <p class="text-xs sm:text-sm text-[#c9a3b1] max-w-md mx-auto leading-relaxed">
            ${msg.desc}
          </p>
        </div>
      `
      return
    }

    tabContent.innerHTML = filtered.map((a) => renderCardBySection(a)).join('')
    bindAppointmentActions()
  }

  // ==========================================================================
  // TARJETAS ESPACIOSAS Y SIMPLES SEGÚN LA SECCIÓN ACTIVA
  // ==========================================================================
  function renderCardBySection(a) {
    const graceInfo = evaluateGraceStatus(
      a.appointment_date,
      a.appointment_time,
      a.grace_minutes || 25,
      a.status
    )
    const {
      email,
      phone,
      paymentProof,
      referenceNote,
      hasEmail,
      hasPhone,
      hasPaymentProof,
      channelLabel,
    } = extractContactInfo(a)

    // ------------------------------------------------------------------------
    // SECCIÓN 1: SOLICITUDES NUEVAS (Solo revisar pago 50% y Aceptar o Rechazar)
    // ------------------------------------------------------------------------
    if (activeTab === 'solicitudes') {
      return `
        <article class="iso-card p-6 sm:p-8 border-[#fcd34d]/35 space-y-6" data-id="${a.id}">
          
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f7f5f4]/10 pb-5">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="badge-warning text-[11px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold">
                  Nueva Solicitud • Verificar 50%
                </span>
                <span class="font-mono-code text-xs text-[#E3B8D0]">${a.booking_code}</span>
              </div>
              <h3 class="font-serif-editorial text-3xl text-[#f7f5f4] font-semibold">
                ${a.client_name}
              </h3>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <!-- Datos claros y separados -->
            <div class="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm bg-[#0a0a0a]/60 p-5 rounded-2xl border border-[#f7f5f4]/5">
              <div>
                <span class="text-[#c9a3b1] text-xs block mb-1">Tipo de sesión</span>
                <strong class="text-[#E3B8D0] text-base font-medium">${a.service_name}</strong>
              </div>
              <div>
                <span class="text-[#c9a3b1] text-xs block mb-1">Cantidad de personas</span>
                <strong class="text-[#f7f5f4] font-mono-code text-base">${a.people_count} ${
                  a.people_count === 1 ? 'persona' : 'personas'
                }</strong>
              </div>
              <div>
                <span class="text-[#c9a3b1] text-xs block mb-1">Fecha y Hora solicitada</span>
                <strong class="text-[#f7f5f4] font-mono-code">
                  ${formatDateSpanish(a.appointment_date)} • ${formatTime12h(a.appointment_time)}
                </strong>
              </div>
              <div>
                <span class="text-[#c9a3b1] text-xs block mb-1">Contacto del cliente</span>
                <strong class="text-[#f7f5f4] block break-all text-xs">${email || ''}</strong>
                <strong class="text-[#f7f5f4] font-mono-code block text-xs mt-0.5">${phone || ''}</strong>
              </div>
            </div>

            <!-- Comprobante del 50% bien visible -->
            <div class="lg:col-span-5 bg-[#141114] border border-[#D795B7]/35 rounded-2xl p-5 flex items-center gap-4">
              ${
                hasPaymentProof
                  ? `
                  <img
                    src="${paymentProof}"
                    alt="Comprobante 50%"
                    data-action="view-voucher"
                    data-id="${a.id}"
                    class="w-20 h-20 rounded-xl object-cover border border-[#D795B7]/50 cursor-pointer hover:scale-105 transition-transform shrink-0"
                  />
                  <div class="space-y-1.5 min-w-0">
                    <span class="badge-arrived text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-semibold inline-block">
                      Pago 50% Adjunto
                    </span>
                    ${
                      referenceNote
                        ? `<p class="text-xs text-[#c9a3b1] truncate">Ref: ${referenceNote}</p>`
                        : ''
                    }
                    <button
                      type="button"
                      data-action="view-voucher"
                      data-id="${a.id}"
                      class="text-xs text-[#E3B8D0] underline font-medium cursor-pointer block pt-0.5"
                    >
                      Ver foto de la transferencia
                    </button>
                  </div>
                `
                  : `<p class="text-xs text-[#c9a3b1]">Sin imagen de comprobante adjunta.</p>`
              }
            </div>
          </div>

          <!-- Únicos 2 Botones de Decisión en esta pestaña -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-[#f7f5f4]/10">
            <button
              type="button"
              data-action="open-reject"
              data-id="${a.id}"
              class="btn-iso-secondary px-5 py-3 text-xs sm:text-sm font-medium text-[#fda4af] hover:border-[#fda4af]/50 cursor-pointer"
            >
              Rechazar Solicitud
            </button>
            <button
              type="button"
              data-action="status"
              data-id="${a.id}"
              data-status="confirmada"
              class="btn-iso-primary px-7 py-3 text-xs sm:text-sm font-medium cursor-pointer"
            >
              Aceptar Cita (Pasar a Citas)
            </button>
          </div>
        </article>
      `
    }

    // ------------------------------------------------------------------------
    // SECCIÓN 2: CITAS (Aceptadas y en Desarrollo)
    // ------------------------------------------------------------------------
    if (activeTab === 'citas') {
      const arrived = a.status === 'en_estudio'
      return `
        <article class="iso-card p-6 sm:p-8 border-[#86efac]/30 space-y-6" data-id="${a.id}">
          
          <!-- Encabezado + Botones para avisarle al cliente que su cita fue aceptada -->
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#f7f5f4]/10 pb-5">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="badge-arrived text-[11px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold">
                  ${arrived ? 'En Estudio • Llegó a Tiempo' : 'Cita Aceptada'}
                </span>
                <span class="${graceInfo.badgeClass} text-xs px-3 py-1 rounded-full font-mono-code">
                  ${graceInfo.label}
                </span>
                <span class="font-mono-code text-xs text-[#c9a3b1]">${a.booking_code}</span>
              </div>
              <h3 class="font-serif-editorial text-3xl text-[#f7f5f4] font-semibold">
                ${a.client_name}
              </h3>
            </div>

            <!-- Botones de contacto para responderle al cliente por WhatsApp, Llamada y Correo -->
            <div class="flex flex-wrap items-center gap-2.5">
              ${
                hasPhone
                  ? `<a
                      href="${buildWhatsAppLink(a)}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn-iso-primary px-4 py-2 text-xs font-medium flex items-center gap-2 text-[#86efac]"
                    >
                      <span>Responder por WhatsApp</span>
                    </a>
                    <a
                      href="tel:${phone.replace(/\s+/g, '')}"
                      class="btn-iso-secondary px-3.5 py-2 text-xs font-medium"
                    >
                      Llamar
                    </a>`
                  : `<button
                      type="button"
                      data-action="add-phone-whatsapp"
                      data-id="${a.id}"
                      class="btn-iso-primary px-4 py-2 text-xs font-medium flex items-center gap-2 text-[#86efac] cursor-pointer"
                      title="Esta cita antigua no tenía teléfono; haz clic para agregar el número y abrir WhatsApp"
                    >
                      <span>Responder por WhatsApp (+ Tel.)</span>
                    </button>`
              }
              ${
                hasEmail
                  ? `<a
                      href="${buildEmailLink(a)}"
                      class="btn-iso-secondary px-4 py-2 text-xs font-medium flex items-center gap-2"
                    >
                      <span>Responder por Correo</span>
                    </a>`
                  : ''
              }
              ${
                hasPaymentProof
                  ? `<button
                      type="button"
                      data-action="view-voucher"
                      data-id="${a.id}"
                      class="btn-iso-secondary px-3.5 py-2 text-xs text-[#E3B8D0] cursor-pointer"
                    >
                      Ver Pago 50%
                    </button>`
                  : ''
              }
            </div>
          </div>

          <!-- Datos de la Cita con buen espacio -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm bg-[#0a0a0a]/60 p-5 rounded-2xl border border-[#f7f5f4]/5">
            <div>
              <span class="text-[#c9a3b1] text-xs block mb-1">Tipo de sesión</span>
              <strong class="text-[#E3B8D0] text-base font-medium">${a.service_name}</strong>
              <span class="text-xs text-[#c9a3b1] block mt-0.5">${a.people_count} ${
                a.people_count === 1 ? 'persona' : 'personas'
              }</span>
            </div>

            <div>
              <span class="text-[#c9a3b1] text-xs block mb-1">Fecha y Hora</span>
              <strong class="text-[#f7f5f4] font-mono-code block">
                ${formatDateSpanish(a.appointment_date)}
              </strong>
              <span class="text-xs font-mono-code text-[#E3B8D0] block mt-0.5">
                ${formatTime12h(a.appointment_time)}
              </span>
            </div>

            <div>
              <span class="text-[#c9a3b1] text-xs block mb-1">Contacto (${channelLabel})</span>
              <strong class="text-[#f7f5f4] text-xs block break-all">${email || '—'}</strong>
              <strong class="text-[#f7f5f4] font-mono-code text-xs block mt-0.5">${phone || '—'}</strong>
            </div>

            <div>
              <span class="text-[#c9a3b1] text-xs block mb-1">Tiempo de gracia</span>
              <div class="flex items-center gap-1.5 mt-1">
                ${[20, 30]
                  .map(
                    (mins) => `
                  <button
                    type="button"
                    data-action="set-grace"
                    data-id="${a.id}"
                    data-grace="${mins}"
                    class="px-2.5 py-1 rounded-lg text-xs font-mono-code border cursor-pointer ${
                      Number(a.grace_minutes) === mins
                        ? 'bg-[#D795B7]/25 border-[#D795B7] text-[#f7f5f4]'
                        : 'border-[#f7f5f4]/10 text-[#c9a3b1] hover:text-[#f7f5f4]'
                    }"
                  >
                    ${mins} min
                  </button>
                `
                  )
                  .join('')}
              </div>
              <span class="text-[11px] font-mono-code text-[#c9a3b1] block mt-1">
                Límite: ${graceInfo.limit12}
              </span>
            </div>
          </div>

          <!-- Botones del desarrollo de la cita: Llegó a tiempo / No llegó / Cita Completada -->
          <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#f7f5f4]/10">
            <div class="flex flex-wrap items-center gap-2.5">
              ${
                !arrived
                  ? `<button
                      type="button"
                      data-action="status"
                      data-id="${a.id}"
                      data-status="en_estudio"
                      class="btn-iso-secondary px-4 py-2.5 text-xs sm:text-sm font-medium text-[#86efac] border-[#86efac]/40 cursor-pointer"
                    >
                      Llegó a tiempo (En Estudio)
                    </button>
                    <button
                      type="button"
                      data-action="status"
                      data-id="${a.id}"
                      data-status="no_asistio"
                      class="btn-iso-secondary px-4 py-2.5 text-xs sm:text-sm text-[#fda4af] cursor-pointer"
                    >
                      No llegó (Perdió cita)
                    </button>`
                  : `<span class="text-xs text-[#86efac] font-medium">
                      ✓ El cliente ya fue recibido a tiempo en el estudio
                    </span>`
              }
            </div>

            <button
              type="button"
              data-action="status"
              data-id="${a.id}"
              data-status="completada"
              class="btn-iso-primary px-6 py-2.5 text-xs sm:text-sm font-medium cursor-pointer"
            >
              Cita Completada (Terminar y Guardar en Historial)
            </button>
          </div>
        </article>
      `
    }

    // ------------------------------------------------------------------------
    // SECCIÓN 3: HISTORIAL DE CITAS (Terminadas y Rechazadas)
    // ------------------------------------------------------------------------
    const isCompleted = a.status === 'completada'
    const isNoShow = a.status === 'no_asistio'
    const badgeText = isCompleted
      ? 'Sesión Terminada / Completada'
      : isNoShow
      ? 'No asistió (Gracia vencida)'
      : 'Solicitud Rechazada'
    const badgeCls = isCompleted ? 'badge-arrived' : 'badge-expired'
    const isNoteOpen = openNoteEditorId === a.id

    return `
      <article class="iso-card p-6 sm:p-8 space-y-5" data-id="${a.id}">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f7f5f4]/10 pb-4">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2.5">
              <span class="${badgeCls} text-[11px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold">
                ${badgeText}
              </span>
              <span class="font-mono-code text-xs text-[#c9a3b1]">${a.booking_code}</span>
            </div>
            <h3 class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4] font-semibold">
              ${a.client_name}
            </h3>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            ${
              hasPaymentProof
                ? `<button
                    type="button"
                    data-action="view-voucher"
                    data-id="${a.id}"
                    class="btn-iso-secondary px-3 py-1.5 text-xs text-[#E3B8D0] cursor-pointer"
                  >
                    Ver Pago 50%
                  </button>`
                : ''
            }
            <button
              type="button"
              data-action="toggle-note"
              data-id="${a.id}"
              class="btn-iso-secondary px-3 py-1.5 text-xs text-[#c9a3b1] hover:text-[#f7f5f4] cursor-pointer"
            >
              ${a.admin_notes || a.estimated_price ? 'Editar apunte / monto' : '+ Agregar apunte'}
            </button>
            <button
              type="button"
              data-action="status"
              data-id="${a.id}"
              data-status="confirmada"
              class="btn-iso-secondary px-3 py-1.5 text-xs text-[#c9a3b1] hover:text-[#f7f5f4] cursor-pointer"
            >
              Reabrir en Citas
            </button>
            <button
              type="button"
              data-action="delete"
              data-id="${a.id}"
              data-name="${(a.client_name || '').replace(/"/g, '&quot;')}"
              class="btn-iso-secondary px-3 py-1.5 text-xs text-[#fda4af] cursor-pointer"
            >
              Eliminar
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs sm:text-sm bg-[#0a0a0a]/50 p-4 rounded-xl border border-[#f7f5f4]/5">
          <div>
            <span class="text-[#c9a3b1] text-xs block">Sesión</span>
            <strong class="text-[#E3B8D0] font-medium mt-0.5 block">${a.service_name} (${a.people_count} pers.)</strong>
          </div>
          <div>
            <span class="text-[#c9a3b1] text-xs block">Fecha y Hora</span>
            <strong class="text-[#f7f5f4] font-mono-code mt-0.5 block">
              ${formatDateSpanish(a.appointment_date)} • ${formatTime12h(a.appointment_time)}
            </strong>
          </div>
          <div>
            <span class="text-[#c9a3b1] text-xs block">Contacto</span>
            <strong class="text-[#f7f5f4] text-xs mt-0.5 block break-all">${email || phone || '—'}</strong>
          </div>
          <div>
            <span class="text-[#c9a3b1] text-xs block">Monto registrado</span>
            <strong class="text-[#f7f5f4] font-mono-code mt-0.5 block">${formatPriceSlot(a.estimated_price)}</strong>
          </div>
        </div>

        ${
          a.status === 'cancelada'
            ? (() => {
                const rawNote = (a.admin_notes || '').trim()
                const [mainReason, ...extraParts] = rawNote.split(' — ')
                const extraComment = extraParts.join(' — ').trim()
                return `
                  <div class="bg-[#141114] border border-[#fda4af]/35 rounded-2xl p-4 sm:p-5 space-y-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-[11px] uppercase tracking-[0.15em] text-[#fda4af] font-semibold">
                        Detalle del Rechazo
                      </span>
                      <button
                        type="button"
                        data-action="open-reject"
                        data-id="${a.id}"
                        class="text-xs text-[#E3B8D0] underline cursor-pointer"
                      >
                        ${rawNote ? 'Cambiar motivo o comentario' : '+ Agregar motivo de rechazo'}
                      </button>
                    </div>
                    <p class="text-xs sm:text-sm text-[#f7f5f4]">
                      <strong class="text-[#c9a3b1] font-normal">Razón seleccionada:</strong>
                      <span class="font-medium text-[#fda4af] ml-1">${mainReason || 'No especificado'}</span>
                    </p>
                    ${
                      extraComment
                        ? `<p class="text-xs sm:text-sm text-[#f7f5f4] pt-1 border-t border-[#f7f5f4]/10">
                            <strong class="text-[#c9a3b1] font-normal">Comentario adicional de Esther:</strong>
                            <span class="text-[#E3B8D0] ml-1">${extraComment}</span>
                          </p>`
                        : `<p class="text-xs text-[#c9a3b1]/70 italic">Sin comentario adicional escrito.</p>`
                    }
                  </div>
                `
              })()
            : a.admin_notes
            ? `<div class="bg-[#141114] border border-[#D795B7]/25 rounded-2xl p-4 text-xs sm:text-sm text-[#E3B8D0]">
                <strong class="text-[#f7f5f4]">Apunte de Esther:</strong> ${a.admin_notes}
              </div>`
            : ''
        }

        ${
          isNoteOpen
            ? `<div class="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-[#f7f5f4]/10 items-end">
                <div class="sm:col-span-7">
                  <label class="block text-xs text-[#c9a3b1] mb-1">Apunte interno de la sesión:</label>
                  <input
                    type="text"
                    data-notes-input="${a.id}"
                    value="${(a.admin_notes || '').replace(/"/g, '&quot;')}"
                    placeholder="Ej. Entregadas 12 fotos editadas..."
                    class="iso-input text-xs"
                  />
                </div>
                <div class="sm:col-span-3">
                  <label class="block text-xs text-[#c9a3b1] mb-1">Monto cobrado (RD$):</label>
                  <input
                    type="number"
                    step="0.01"
                    data-price-input="${a.id}"
                    value="${a.estimated_price !== null && a.estimated_price !== undefined ? a.estimated_price : ''}"
                    placeholder="0.00"
                    class="iso-input text-xs font-mono-code"
                  />
                </div>
                <div class="sm:col-span-2">
                  <button
                    type="button"
                    data-action="save-notes"
                    data-id="${a.id}"
                    class="btn-iso-primary w-full py-2.5 px-3 text-xs font-medium cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </div>`
            : ''
        }
      </article>
    `
  }

  function renderServicesConfigTab() {
    if (!tabContent) return
    tabContent.innerHTML = `
      <div class="iso-card p-6 sm:p-8 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          ${services
            .map(
              (s) => `
            <div class="bg-[#0a0a0a]/70 border border-[#f7f5f4]/10 rounded-2xl p-5 space-y-4">
              <div class="flex items-center justify-between">
                <span class="font-serif-editorial text-2xl text-[#f7f5f4] font-semibold">${s.name}</span>
                <span class="badge-grace text-[10px] uppercase px-2.5 py-0.5 rounded-full">${s.category}</span>
              </div>
              <div class="grid grid-cols-2 gap-3.5 text-xs">
                <div>
                  <label class="block text-[#c9a3b1] mb-1.5">Minutos de gracia (20 o 30)</label>
                  <select data-srv-grace="${s.id}" class="iso-input font-mono-code text-xs cursor-pointer">
                    <option value="20" ${Number(s.grace_minutes) === 20 ? 'selected' : ''}>20 minutos</option>
                    <option value="25" ${Number(s.grace_minutes) === 25 ? 'selected' : ''}>25 minutos</option>
                    <option value="30" ${Number(s.grace_minutes) === 30 ? 'selected' : ''}>30 minutos</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[#c9a3b1] mb-1.5">Precio Total (RD$)</label>
                  <input
                    type="number"
                    step="0.01"
                    data-srv-price="${s.id}"
                    value="${s.price !== null && s.price !== undefined ? s.price : ''}"
                    placeholder="Por confirmar"
                    class="iso-input font-mono-code text-xs"
                  />
                </div>
              </div>
              <div class="flex justify-end">
                <button
                  type="button"
                  data-action="save-service"
                  data-srv-id="${s.id}"
                  class="btn-iso-primary px-5 py-2 text-xs font-medium cursor-pointer"
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `

    tabContent.querySelectorAll('[data-action="save-service"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const srvId = Number(btn.getAttribute('data-srv-id'))
        const graceEl = tabContent.querySelector(`[data-srv-grace="${srvId}"]`)
        const priceEl = tabContent.querySelector(`[data-srv-price="${srvId}"]`)

        const graceVal = Number(graceEl?.value || 25)
        const rawPrice = priceEl?.value.trim()
        const priceVal = rawPrice ? Number(rawPrice) : null

        const { error } = await supabase
          .from('services')
          .update({ grace_minutes: graceVal, price: priceVal })
          .eq('id', srvId)

        if (error) {
          showToast(`Error al actualizar sesión: ${error.message}`, 'error')
          return
        }
        showToast('Configuración actualizada', 'success')
        fetchAllData()
      })
    })
  }

  async function updateAppointmentStatus(id, newStatus) {
    const updates = { status: newStatus }
    if (newStatus === 'en_estudio') updates.arrived_at = new Date().toISOString()
    if (newStatus === 'completada') updates.completed_at = new Date().toISOString()

    const { error } = await supabase.from('appointments').update(updates).eq('id', id)
    if (error) {
      showToast(`No se pudo actualizar: ${error.message}`, 'error')
      return
    }

    const msgMap = {
      confirmada: '¡Cita Aceptada! Se movió a la sección 2. Citas',
      en_estudio: 'Llegada a tiempo registrada en el estudio',
      completada: '¡Cita Completada! Se guardó en 3. Historial de Citas',
      no_asistio: 'Marcada como No asistió (guardada en Historial)',
      cancelada: 'Solicitud rechazada (guardada en Historial)',
    }
    showToast(msgMap[newStatus] || 'Estado actualizado', 'success')
    fetchAllData()
  }

  function bindAppointmentActions() {
    if (!tabContent) return

    tabContent.querySelectorAll('[data-action="status"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'))
        const newStatus = btn.getAttribute('data-status')
        if (id && newStatus) updateAppointmentStatus(id, newStatus)
      })
    })

    tabContent.querySelectorAll('[data-action="open-reject"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'))
        const found = appointments.find((a) => a.id === id)
        if (found) openRejectModal(found)
      })
    })

    tabContent.querySelectorAll('[data-action="add-phone-whatsapp"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'))
        const found = appointments.find((a) => a.id === id)
        if (!found) return

        const entered = window.prompt(
          `Ingresa el número de WhatsApp / Teléfono (+1) de ${found.client_name}:`,
          '+1 809-'
        )
        if (!entered || entered.replace(/\D/g, '').length < 7) return

        const formattedPhone = entered.trim().startsWith('+')
          ? entered.trim()
          : `+1 ${entered.trim()}`

        const { error } = await supabase
          .from('appointments')
          .update({ client_phone: formattedPhone })
          .eq('id', id)

        if (error) {
          showToast(`No se pudo guardar el teléfono: ${error.message}`, 'error')
          return
        }

        const updatedApp = { ...found, client_phone: formattedPhone }
        window.open(buildWhatsAppLink(updatedApp), '_blank', 'noopener,noreferrer')
        showToast('Teléfono guardado y abriendo WhatsApp', 'success')
        fetchAllData()
      })
    })

    tabContent.querySelectorAll('[data-action="toggle-note"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'))
        openNoteEditorId = openNoteEditorId === id ? null : id
        renderActiveTab()
      })
    })

    tabContent.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'))
        const clientName = btn.getAttribute('data-name') || 'esta cita'
        if (!window.confirm(`¿Deseas eliminar definitivamente el registro de ${clientName}?`)) {
          return
        }
        const { error } = await supabase.from('appointments').delete().eq('id', id)
        if (error) {
          showToast(`No se pudo eliminar: ${error.message}`, 'error')
          return
        }
        showToast('Registro eliminado', 'info')
        fetchAllData()
      })
    })

    tabContent.querySelectorAll('[data-action="view-voucher"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-id'))
        const found = appointments.find((a) => a.id === id)
        if (!found) return

        const { paymentProof, referenceNote, channelLabel } = extractContactInfo(found)
        if (!paymentProof) return

        activeVoucherAppointment = found
        if (voucherModalClient) {
          voucherModalClient.textContent = `${found.client_name} (${found.booking_code})`
        }
        if (voucherModalMeta) {
          voucherModalMeta.textContent = `${found.service_name} • ${formatDateSpanish(
            found.appointment_date
          )} a las ${formatTime12h(found.appointment_time)} • ${channelLabel}${
            referenceNote ? ` • Ref: ${referenceNote}` : ''
          }`
        }
        if (voucherModalImg) voucherModalImg.src = paymentProof
        if (btnDownloadVoucher) {
          btnDownloadVoucher.href = paymentProof
          btnDownloadVoucher.download = `comprobante-${found.booking_code}.jpg`
        }
        // Mostrar botones de Aceptar/Rechazar en el visor solo si aún está pendiente
        if (voucherModalActions) {
          if (found.status === 'pendiente') {
            voucherModalActions.classList.remove('hidden')
          } else {
            voucherModalActions.classList.add('hidden')
          }
        }
        voucherModal?.classList.remove('hidden')
      })
    })

    tabContent.querySelectorAll('[data-action="set-grace"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'))
        const grace = Number(btn.getAttribute('data-grace'))
        const { error } = await supabase
          .from('appointments')
          .update({ grace_minutes: grace })
          .eq('id', id)

        if (!error) {
          showToast(`Tiempo de gracia ajustado a ${grace} minutos`, 'info')
          fetchAllData()
        }
      })
    })

    tabContent.querySelectorAll('[data-action="save-notes"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'))
        const notesInput = tabContent.querySelector(`[data-notes-input="${id}"]`)
        const priceInput = tabContent.querySelector(`[data-price-input="${id}"]`)

        const admin_notes = notesInput ? notesInput.value.trim() : ''
        const rawPrice = priceInput ? priceInput.value.trim() : ''
        const estimated_price = rawPrice ? Number(rawPrice) : null

        const { error } = await supabase
          .from('appointments')
          .update({ admin_notes, estimated_price })
          .eq('id', id)

        if (error) {
          showToast(`Error al guardar apunte: ${error.message}`, 'error')
          return
        }
        openNoteEditorId = null
        showToast('Apunte guardado en el historial', 'success')
        fetchAllData()
      })
    })
  }

  btnCloseVoucherModal?.addEventListener('click', () => {
    voucherModal?.classList.add('hidden')
  })

  btnApproveFromModal?.addEventListener('click', async () => {
    if (!activeVoucherAppointment) return
    voucherModal?.classList.add('hidden')
    await updateAppointmentStatus(activeVoucherAppointment.id, 'confirmada')
  })

  btnRejectFromModal?.addEventListener('click', () => {
    if (!activeVoucherAppointment) return
    voucherModal?.classList.add('hidden')
    openRejectModal(activeVoucherAppointment)
  })

  btnCloseRejectModal?.addEventListener('click', () => {
    rejectReasonModal?.classList.add('hidden')
    rejectingAppointment = null
  })

  btnCancelRejectModal?.addEventListener('click', () => {
    rejectReasonModal?.classList.add('hidden')
    rejectingAppointment = null
  })

  rejectReasonForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!rejectingAppointment) return

    const selectedReason = String(rejectReasonSelect?.value || '').trim()
    const extraNote = String(rejectReasonNote?.value || '').trim()
    const finalNote = extraNote ? `${selectedReason} — ${extraNote}` : selectedReason

    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelada',
        admin_notes: finalNote,
      })
      .eq('id', rejectingAppointment.id)

    if (error) {
      showToast(`No se pudo rechazar: ${error.message}`, 'error')
      return
    }

    rejectReasonModal?.classList.add('hidden')
    rejectingAppointment = null
    showToast('Solicitud rechazada y guardada en 3. Historial de Citas', 'info')
    fetchAllData()
  })

  async function fetchAllData() {
    const [appRes, srvRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true }),
      supabase
        .from('services')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('id', { ascending: true }),
    ])

    if (!appRes.error && Array.isArray(appRes.data)) {
      appointments = appRes.data
    }
    if (!srvRes.error && Array.isArray(srvRes.data)) {
      services = srvRes.data.filter((s) =>
        ['foto-navidena', 'infantil', 'retrato'].includes(s.slug)
      )
    }

    renderActiveTab()
  }

  // Clic en cualquiera de las 4 Tarjetas de Sección
  container.querySelectorAll('.tab-card').forEach((card) => {
    card.addEventListener('click', () => {
      activeTab = card.getAttribute('data-tab') || 'solicitudes'
      renderActiveTab()
    })
  })

  // Sub-filtros de la Sección 3 (Historial)
  container.querySelectorAll('.hfilter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      historySubFilter = btn.getAttribute('data-hfilter') || 'todas'
      container.querySelectorAll('.hfilter-btn').forEach((b) => {
        const isCurrent = b.getAttribute('data-hfilter') === historySubFilter
        b.className = `hfilter-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer ${
          isCurrent
            ? 'bg-[#1f151a] text-[#f7f5f4] border border-[#D795B7]/45'
            : 'bg-[#141114] text-[#c9a3b1] border border-[#f7f5f4]/10 hover:text-[#f7f5f4]'
        }`
      })
      renderActiveTab()
    })
  })

  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value.trim()
    renderActiveTab()
  })

  container.querySelector('#btn-export-csv')?.addEventListener('click', () => {
    if (!appointments.length) {
      showToast('No hay registros para exportar todavía', 'warning')
      return
    }
    exportAppointmentsToCSV(appointments)
    showToast('Archivo Excel (CSV) descargado', 'success')
  })

  container.querySelector('#btn-lock-admin')?.addEventListener('click', () => {
    sessionStorage.removeItem('iso_admin_auth')
    renderAdminView(container)
  })

  container.querySelector('#btn-new-manual')?.addEventListener('click', () => {
    manualModal?.classList.remove('hidden')
  })
  container.querySelector('#btn-close-manual')?.addEventListener('click', () => {
    manualModal?.classList.add('hidden')
  })
  container.querySelector('#btn-cancel-manual')?.addEventListener('click', () => {
    manualModal?.classList.add('hidden')
  })

  manualForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(manualForm)
    const emailVal = String(fd.get('client_email') || '').trim()
    const phoneVal = String(fd.get('client_phone') || '').trim()
    const chosenStatus = String(fd.get('status') || 'confirmada')

    const payload = {
      booking_code: generateBookingCode(),
      client_name: String(fd.get('client_name') || '').trim(),
      client_phone: phoneVal || 'No proporcionado (Solo correo)',
      service_name: String(fd.get('service_name') || 'Foto Navideña'),
      people_count: Number(fd.get('people_count') || 1),
      appointment_date: String(fd.get('appointment_date') || todayStr),
      appointment_time: String(fd.get('appointment_time') || '10:00'),
      grace_minutes: 25,
      status: chosenStatus,
      client_notes: serializeClientMeta({ email: emailVal, paymentProof: '', referenceNote: '' }),
    }

    const { error } = await supabase.from('appointments').insert([payload])
    if (error) {
      showToast(`Error al guardar: ${error.message}`, 'error')
      return
    }

    manualModal?.classList.add('hidden')
    manualForm.reset()
    activeTab = chosenStatus === 'completada' ? 'historial' : 'citas'
    showToast('Cita manual guardada', 'success')
    fetchAllData()
  })

  const channel = supabase
    .channel('iso-appointments-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments' },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          playNewBookingSound()
          showToast(
            `Nueva solicitud con pago 50% de ${payload.new.client_name}`,
            'info'
          )
        }
        fetchAllData()
      }
    )
    .subscribe()

  refreshTimer = setInterval(() => {
    if (activeTab === 'citas') renderActiveTab()
  }, 30000)

  fetchAllData()

  return () => {
    clearInterval(refreshTimer)
    supabase.removeChannel(channel)
  }
}
