import { supabase } from '../supabase'
import { showToast } from '../utils/toast'
import {
  generateBookingCode,
  formatTime12h,
  calculateGraceLimit,
  formatDateSpanish,
  formatPriceSlot,
  formatDeposit50,
  describeCustomerResponseChannel,
  extractContactInfo,
  compressReceiptImage,
  serializeClientMeta,
  BANK_ACCOUNTS_INFO,
  getPlansConfigForService,
} from '../utils/formatters'
import { printBookingTicket } from '../utils/exportUtils'

const ALLOWED_SERVICE_SLUGS = ['foto-navidena', 'infantil', 'retrato']

const DEFAULT_SERVICES = [
  {
    id: 1,
    slug: 'foto-navidena',
    name: 'Foto Navideña',
    category: 'Temporada',
    duration_minutes: 45,
    grace_minutes: 20,
    price: null,
    description: 'Sesión especial de temporada navideña en set decorado de estudio.',
    is_featured: true,
  },
  {
    id: 3,
    slug: 'infantil',
    name: 'Infantil',
    category: 'Estudio',
    duration_minutes: 45,
    grace_minutes: 25,
    price: null,
    description: 'Retrato infantil espontáneo y delicado para niños y bebés.',
    is_featured: false,
  },
  {
    id: 4,
    slug: 'retrato',
    name: 'Retrato',
    category: 'Estudio',
    duration_minutes: 60,
    grace_minutes: 20,
    price: null,
    description: 'Sesión individual de retrato editorial, cumpleaños o fine art.',
    is_featured: false,
  },
]

// Horario oficial de ISO Estudio:
// • Lunes a Viernes: 5:00 PM a 8:00 PM
// • Domingos: 8:00 AM a 5:00 PM
const WEEKDAY_SLOTS = ['17:00', '18:00', '19:00', '20:00']
const SUNDAY_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]

function getScheduleForDate(dateStr) {
  if (!dateStr) {
    return {
      isOpen: true,
      scheduleLabel: 'Lunes a Viernes (5:00 PM – 8:00 PM)',
      slots: WEEKDAY_SLOTS,
    }
  }
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayOfWeek = new Date(y, m - 1, d).getDay() // 0 = Domingo, 1..5 = Lun..Vie, 6 = Sábado

  if (dayOfWeek === 0) {
    return {
      isOpen: true,
      scheduleLabel: 'Horario de Domingo: 8:00 AM a 5:00 PM',
      slots: SUNDAY_SLOTS,
    }
  }
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    return {
      isOpen: true,
      scheduleLabel: 'Horario Lunes a Viernes: 5:00 PM a 8:00 PM',
      slots: WEEKDAY_SLOTS,
    }
  }
  return {
    isOpen: false,
    scheduleLabel: 'Sábado sin servicio • Elige Lunes a Viernes o Domingo',
    slots: [],
  }
}

function getInitialOpenDateStr() {
  const now = new Date()
  if (now.getDay() === 6) {
    now.setDate(now.getDate() + 1) // Si hoy es sábado, pasa automáticamente al domingo
  }
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const ISO_CAROUSEL_SLIDES = [
  { src: '/foto-navidena-bg.jpg', tag: 'Foto Navideña • Set de Temporada — ISO Estudio' },
  { src: '/carousel/iso-slide-01.jpg', tag: 'Retrato Editorial • ISO Estudio' },
  { src: '/carousel/iso-slide-02.jpg', tag: 'Sesión de Estudio • Iluminación de Autor' },
  { src: '/carousel/iso-slide-03.jpg', tag: 'Dirección Creativa • ISO Estudio' },
  { src: '/carousel/iso-slide-04.jpg', tag: 'Retrato Fine Art • San Cristóbal' },
  { src: '/carousel/iso-slide-05.jpg', tag: 'Sesión Personalizada • Estudio' },
  { src: '/carousel/iso-slide-06.jpg', tag: 'Estética Boutique • ISO Estudio' },
  { src: '/carousel/iso-slide-07.jpg', tag: 'Fotografía de Retrato & Cumpleaños' },
  { src: '/carousel/iso-slide-08.jpg', tag: 'Retrato Contemporáneo • ISO Estudio' },
  { src: '/carousel/iso-slide-09.jpg', tag: 'Sesión Artística en Estudio' },
  { src: '/carousel/iso-slide-10.jpg', tag: 'Maternidad, Infantil & Familia' },
  { src: '/carousel/iso-slide-11.jpg', tag: 'Editorial & Marca Personal' },
  { src: '/carousel/iso-slide-12.jpg', tag: 'Retrato Íntimo • ISO Estudio' },
  { src: '/carousel/iso-slide-13.jpg', tag: 'Temporada & Sesiones Especiales' },
  { src: '/carousel/iso-slide-14.jpg', tag: 'Narrativa Visual • ISO Estudio' },
]

export function renderBookingView(container) {
  let services = [...DEFAULT_SERVICES]
  let selectedService = services[0]
  let selectedPlan = getPlansConfigForService(selectedService).plans[0]
  let peopleCount = 2
  let pendingDraft = null
  let uploadedReceiptDataUrl = ''
  let lastCreatedBooking = null
  let currentSlideIdx = 0
  let carouselTimer = null

  const todayStr = new Date().toISOString().split('T')[0]
  let selectedDate = getInitialOpenDateStr()
  let selectedTime = getScheduleForDate(selectedDate).slots[0] || '17:00'

  container.innerHTML = `
    <div class="relative min-h-[calc(100vh-4.5rem)] overflow-hidden">
      
      <!-- ================================================================== -->
      <!-- CARRUSEL DE FONDO DIFUMINADO TIPO GLASS (AMBIENT ISO STUDIO)       -->
      <!-- ================================================================== -->
      <div class="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
        ${ISO_CAROUSEL_SLIDES.map(
          (slide, idx) => `
          <div class="iso-bg-slide ${idx === 0 ? 'active' : ''}" data-bg-slide="${idx}">
            <img
              ${idx < 2 ? `src="${slide.src}"` : `data-src="${slide.src}"`}
              alt=""
              class="w-full h-full object-cover scale-105 filter blur-[6px] brightness-[0.42] contrast-[1.08] saturate-[1.1]"
            />
          </div>
        `
        ).join('')}

        <!-- Capas Glass y Viñeta Editorial para legibilidad perfecta -->
        <div class="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-[#141114]/65 to-[#0a0a0a]/92 backdrop-blur-[2px]"></div>
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_15%,rgba(10,10,10,0.78)_100%)]"></div>
      </div>

      <!-- Contenido Principal Flotando en Glassmorphism sobre el Carrusel -->
      <div class="relative z-10 animate-view-enter max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        
        <!-- Hero Dinámico: Encabezado + Carrusel Interactivo de Fotos de ISO Estudio -->
        <div class="iso-card p-6 sm:p-8 mb-8 border border-[#D795B7]/30">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            <!-- Texto de Bienvenida -->
            <div class="lg:col-span-7 space-y-3">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full badge-grace text-[11px] uppercase tracking-[0.16em] font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-[#D795B7] animate-pulse"></span>
                <span>Agenda Abierta • Temporada Navideña &amp; Estudio</span>
              </div>
              <h1 class="font-serif-editorial text-3xl sm:text-5xl font-semibold tracking-wide text-[#f7f5f4] leading-tight">
                Reserva tu sesión fotográfica
              </h1>
              <p class="text-sm sm:text-base text-[#c9a3b1] leading-relaxed">
                Completa los datos esenciales para agendar tu espacio en <strong class="text-[#f7f5f4] font-medium">ISO Estudio</strong>.
                Tu cita se aparta realizando la transferencia del <strong class="text-[#E3B8D0] font-medium">50% y anexando tu comprobante</strong>, y cuenta con <strong class="text-[#E3B8D0] font-medium">20 a 30 minutos de gracia</strong> para tu llegada.
              </p>
            </div>

            <!-- Visor del Carrusel en Vivo de ISO Estudio -->
            <div class="lg:col-span-5">
              <div class="relative aspect-[4/3] w-full rounded-2xl overflow-hidden border border-[#D795B7]/40 shadow-2xl bg-[#0a0a0a] group">
                ${ISO_CAROUSEL_SLIDES.map(
                  (slide, idx) => `
                  <div class="iso-showcase-slide ${idx === 0 ? 'active' : ''}" data-showcase-slide="${idx}">
                    <img
                      ${idx < 2 ? `src="${slide.src}"` : `data-src="${slide.src}"`}
                      alt="${slide.tag}"
                      class="w-full h-full object-cover object-center"
                    />
                  </div>
                `
                ).join('')}

                <!-- Degradado inferior con etiqueta de la foto y controles -->
                <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3.5 flex items-end justify-between gap-2 z-10">
                  <div>
                    <span class="text-[10px] uppercase tracking-[0.18em] text-[#E3B8D0] font-semibold block">
                      Portafolio ISO Estudio
                    </span>
                    <p id="carousel-caption" class="text-xs text-[#f7f5f4] font-medium mt-0.5">
                      ${ISO_CAROUSEL_SLIDES[0].tag}
                    </p>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <span id="carousel-counter" class="font-mono-code text-[11px] text-[#c9a3b1] mr-1">
                      01 / ${String(ISO_CAROUSEL_SLIDES.length).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      id="btn-carousel-prev"
                      aria-label="Foto anterior"
                      class="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-[#f7f5f4]/20 text-[#f7f5f4] hover:border-[#D795B7] flex items-center justify-center text-xs cursor-pointer"
                    >
                      &#8249;
                    </button>
                    <button
                      type="button"
                      id="btn-carousel-next"
                      aria-label="Siguiente foto"
                      class="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-[#f7f5f4]/20 text-[#f7f5f4] hover:border-[#D795B7] flex items-center justify-center text-xs cursor-pointer"
                    >
                      &#8250;
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      <!-- Layout Principal en Bento Grid -->
      <form id="booking-form" class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" novalidate>
        
        <!-- Columna Izquierda: Campos Esenciales -->
        <div class="lg:col-span-7 space-y-6">
          
          <!-- PASO 1: Tipo de Sesión -->
          <section class="iso-card p-5 sm:p-6">
            <div class="flex items-center justify-between mb-4">
              <label class="text-xs uppercase tracking-[0.16em] text-[#D795B7] font-semibold">
                1. ¿Qué tipo de sesión deseas?
              </label>
              <span class="text-[11px] text-[#c9a3b1]">Selecciona una opción</span>
            </div>

            <div id="services-grid" class="grid grid-cols-1 gap-3"></div>
          </section>

          <!-- PASO 2: Datos del Cliente + Correo Electrónico y Teléfono (+1) -->
          <section class="iso-card p-5 sm:p-6 space-y-5">
            <div class="border-b border-[#f7f5f4]/10 pb-3 flex items-center justify-between">
              <span class="text-xs uppercase tracking-[0.16em] text-[#D795B7] font-semibold">
                2. Tus datos y vía de confirmación
              </span>
              <span class="text-[11px] text-[#c9a3b1]">Correo y/o Teléfono</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <!-- Nombre Completo -->
              <div class="sm:col-span-7">
                <label for="client_name" class="block text-xs font-medium text-[#f7f5f4] mb-1.5">
                  Nombre completo <span class="text-[#D795B7]">*</span>
                </label>
                <input
                  type="text"
                  id="client_name"
                  name="client_name"
                  required
                  autocomplete="name"
                  placeholder="Ej. Valeria Mendoza"
                  class="iso-input"
                />
              </div>

              <!-- ¿Cuántas personas? -->
              <div class="sm:col-span-5">
                <label for="people_count" class="block text-xs font-medium text-[#f7f5f4] mb-1.5">
                  ¿Cuántas personas? <span class="text-[#D795B7]">*</span>
                </label>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-people-minus"
                    aria-label="Restar una persona"
                    class="btn-iso-secondary w-11 h-11 flex items-center justify-center text-base font-medium cursor-pointer shrink-0"
                  >
                    &minus;
                  </button>
                  <input
                    type="number"
                    id="people_count"
                    name="people_count"
                    min="1"
                    max="20"
                    value="2"
                    required
                    class="iso-input text-center font-mono-code font-medium"
                  />
                  <button
                    type="button"
                    id="btn-people-plus"
                    aria-label="Sumar una persona"
                    class="btn-iso-secondary w-11 h-11 flex items-center justify-center text-base font-medium cursor-pointer shrink-0"
                  >
                    &#43;
                  </button>
                </div>
              </div>
            </div>

            <!-- Campos de Contacto: Teléfono (+1 Requerido para WhatsApp/Llamada) y Correo Electrónico -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label for="client_phone" class="block text-xs font-medium text-[#f7f5f4] mb-1.5">
                  Número telefónico <span class="text-[#D795B7]">*</span>
                  <span class="text-[11px] text-[#c9a3b1] font-normal">(WhatsApp / Llamada)</span>
                </label>
                <div class="flex items-center">
                  <span class="h-[46px] px-3 rounded-l-[10px] bg-[#1f151a] border border-r-0 border-[#f7f5f4]/10 text-xs font-mono-code text-[#E3B8D0] flex items-center select-none">
                    +1
                  </span>
                  <input
                    type="tel"
                    id="client_phone"
                    name="client_phone"
                    required
                    autocomplete="tel"
                    placeholder="809-555-0192"
                    class="iso-input font-mono-code !rounded-l-none"
                  />
                </div>
              </div>

              <div>
                <label for="client_email" class="block text-xs font-medium text-[#f7f5f4] mb-1.5">
                  Correo electrónico <span class="text-[11px] text-[#c9a3b1] font-normal">(Opcional • Confirmación por email)</span>
                </label>
                <input
                  type="email"
                  id="client_email"
                  name="client_email"
                  autocomplete="email"
                  placeholder="tucorreo@ejemplo.com"
                  class="iso-input"
                />
              </div>
            </div>

            <!-- Aviso inteligente de por qué vía se le responderá -->
            <div class="rounded-xl bg-[#0a0a0a]/80 border border-[#f7f5f4]/10 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-[#c9a3b1]">
              <svg class="w-4 h-4 text-[#D795B7] shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span id="contact-channel-feedback">
                Al verificar tu pago del 50% te responderemos por correo electrónico, llamada telefónica/WhatsApp, o por ambas vías según los datos que completes arriba.
              </span>
            </div>
          </section>

          <!-- PASO 3: Fecha y Hora de la Reserva -->
          <section class="iso-card p-5 sm:p-6 space-y-5">
            <div class="border-b border-[#f7f5f4]/10 pb-3 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs uppercase tracking-[0.16em] text-[#D795B7] font-semibold">
                3. Fecha y hora de tu sesión
              </span>
              <span id="grace-inline-hint" class="text-[11px] text-[#E3B8D0] font-mono-code"></span>
            </div>

            <!-- Aviso claro de los horarios de ISO Estudio -->
            <div class="rounded-xl bg-[#0a0a0a]/75 border border-[#D795B7]/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-[#c9a3b1]">
                <strong class="text-[#f7f5f4]">Lunes a Viernes:</strong> 5:00 PM a 8:00 PM
              </span>
              <span class="text-[#c9a3b1]">
                <strong class="text-[#f7f5f4]">Domingos:</strong> 8:00 AM a 5:00 PM
              </span>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="appointment_date" class="block text-xs font-medium text-[#f7f5f4]">
                  Selecciona el día <span class="text-[#D795B7]">*</span>
                </label>
                <span id="schedule-day-badge" class="text-[11px] text-[#E3B8D0] font-medium"></span>
              </div>
              <input
                type="date"
                id="appointment_date"
                name="appointment_date"
                min="${todayStr}"
                value="${selectedDate}"
                required
                class="iso-input font-mono-code cursor-pointer"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-[#f7f5f4] mb-2">
                Selecciona la hora disponible <span class="text-[#D795B7]">*</span>
              </label>
              <div id="time-slots-grid" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5"></div>
            </div>
          </section>
        </div>

        <!-- Columna Derecha: Resumen de Reserva + Abono 50% + Gracia 20-30m -->
        <aside class="lg:col-span-5 lg:sticky lg:top-24 space-y-5">
          <div class="iso-card p-6 border border-[#D795B7]/35 space-y-5">
            <div class="flex items-center justify-between border-b border-[#f7f5f4]/10 pb-4">
              <div>
                <span class="text-[10px] uppercase tracking-[0.2em] text-[#D795B7] font-semibold block">
                  Resumen de Cita
                </span>
                <h2 id="summary-service-name" class="font-serif-editorial text-2xl text-[#f7f5f4] mt-0.5">
                  Foto Navideña
                </h2>
              </div>
              <span id="summary-category-badge" class="badge-grace text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-medium">
                Temporada
              </span>
            </div>

            <div class="space-y-3 text-xs sm:text-sm">
              <div class="flex items-center justify-between py-1.5 border-b border-[#f7f5f4]/5">
                <span class="text-[#c9a3b1]">Personas en sesión</span>
                <span id="summary-people" class="font-mono-code font-medium text-[#f7f5f4]">2 personas</span>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-[#f7f5f4]/5">
                <span class="text-[#c9a3b1]">Fecha elegida</span>
                <span id="summary-date" class="font-medium text-[#f7f5f4]">${formatDateSpanish(selectedDate)}</span>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-[#f7f5f4]/5">
                <span class="text-[#c9a3b1]">Hora de inicio</span>
                <span id="summary-time" class="font-mono-code font-medium text-[#f7f5f4]">${formatTime12h(selectedTime)}</span>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-[#f7f5f4]/5">
                <span class="text-[#c9a3b1]">Inversión total</span>
                <span id="summary-price" class="font-mono-code font-medium text-[#f7f5f4]">
                  Precio por confirmar
                </span>
              </div>
              <div class="flex items-center justify-between py-1.5 border-b border-[#f7f5f4]/10">
                <span class="text-[#c9a3b1]">Para reservar (50%)</span>
                <span id="summary-deposit" class="font-mono-code font-medium text-[#E3B8D0]">
                  50% vía transferencia
                </span>
              </div>
            </div>

            <!-- Bloque Destacado: Tiempo de Gracia de 20 a 30 minutos -->
            <div class="rounded-xl bg-[#0a0a0a]/90 border border-[#D795B7]/30 p-4 space-y-1.5">
              <div class="flex items-center gap-2 text-xs font-semibold text-[#E3B8D0]">
                <svg class="w-4 h-4 text-[#D795B7] shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span id="summary-grace-title">Tiempo de gracia: 20 minutos</span>
              </div>
              <p id="summary-grace-desc" class="text-xs text-[#c9a3b1] leading-relaxed"></p>
            </div>

            <!-- Mensaje de error accesible -->
            <div id="booking-error" class="hidden text-xs text-[#fda4af] bg-[#fda4af]/10 border border-[#fda4af]/30 rounded-lg px-3.5 py-2.5"></div>

            <!-- Botón que abre el Modal de Pago 50% + Subida de Comprobante -->
            <button
              type="submit"
              id="btn-submit-booking"
              class="btn-iso-primary w-full py-3.5 px-6 text-sm font-medium flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>Continuar al pago del 50%</span>
              <svg class="w-4 h-4 text-[#E3B8D0]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </aside>
      </form>

      <!-- ================================================================== -->
      <!-- MODAL 0: SELECCIÓN DE PLANES Y FONDO POR TIPO DE SESIÓN            -->
      <!-- ================================================================== -->
      <div
        id="session-plan-modal"
        class="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-modal-title"
      >
        <div
          id="session-plan-modal-card"
          class="relative overflow-hidden iso-card max-w-3xl w-full border border-[#D795B7]/50 max-h-[94vh] overflow-y-auto animate-view-enter shadow-2xl"
        >
          <!-- Imagen de Fondo del Modal (Destacada en Foto Navideña y sutil en las demás) -->
          <div class="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
            <img
              id="plan-modal-bg-img"
              src="/foto-navidena-bg.jpg"
              alt=""
              class="w-full h-full object-cover object-center transition-opacity duration-500"
            />
            <div
              id="plan-modal-bg-overlay"
              class="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/65 via-[#141114]/82 to-[#0a0a0a]/95"
            ></div>
          </div>

          <!-- Contenido del Modal sobre el Fondo -->
          <div class="relative z-10 p-6 sm:p-8 space-y-6">
            
            <!-- Cabecera del Modal -->
            <div class="flex items-start justify-between gap-4 border-b border-[#f7f5f4]/15 pb-4">
              <div>
                <span
                  id="plan-modal-eyebrow"
                  class="badge-grace bg-[#161014]/90 backdrop-blur-sm text-[10px] uppercase tracking-[0.2em] px-3 py-1 rounded-full font-semibold inline-block mb-2"
                >
                  Un momento, una historia, una foto • ISO Estudio
                </span>
                <h3 id="plan-modal-title" class="font-serif-editorial text-3xl sm:text-4xl text-[#f7f5f4] font-semibold drop-shadow">
                  Planes Fotográficos
                </h3>
                <p id="plan-modal-subtitle" class="text-xs sm:text-sm text-[#E3B8D0] mt-1"></p>
              </div>

              <button
                type="button"
                id="btn-close-plan-modal"
                aria-label="Cerrar selector de planes"
                class="btn-iso-secondary w-9 h-9 flex items-center justify-center text-[#f7f5f4] shrink-0 cursor-pointer bg-[#141114]/85"
              >
                &times;
              </button>
            </div>

            <!-- Galería / Vista Previa Visual de la Sesión dentro del Modal -->
            <div class="relative rounded-2xl overflow-hidden border border-[#D795B7]/35 bg-[#0a0a0a]/90 shadow-xl">
              <div id="plan-modal-showcase-media" class="w-full">
                <img
                  id="plan-modal-showcase-img"
                  src="/foto-navidena-bg.jpg"
                  alt="Vista previa de la sesión"
                  class="w-full h-52 sm:h-64 object-cover object-center"
                />
              </div>
              <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/90 via-transparent to-transparent flex items-end justify-between p-4 pointer-events-none">
                <span id="plan-modal-grace-pill" class="badge-arrived bg-[#0a0a0a]/85 backdrop-blur-sm text-[11px] font-mono-code px-3 py-1 rounded-full">
                  +25 min de gracia incluidos
                </span>
                <a
                  id="plan-modal-flyer-link"
                  href="/planes/flyer-ninos-2planes.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="pointer-events-auto rounded-full bg-[#141114]/90 backdrop-blur-sm border border-[#D795B7]/40 px-3.5 py-1 text-[11px] font-medium text-[#E3B8D0] hover:text-[#f7f5f4] hover:border-[#D795B7] transition inline-flex items-center gap-1.5"
                >
                  Ver afiche de precios
                </a>
              </div>
            </div>

            <!-- Tarjetas de Selección de Plan (2 planes o 3 planes según la sesión) -->
            <div class="space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs uppercase tracking-[0.16em] text-[#D795B7] font-semibold">
                  Selecciona el plan para tu sesión
                </span>
                <span class="text-[11px] text-[#c9a3b1]">Reserva con el 50%</span>
              </div>

              <div id="plan-modal-cards-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-4"></div>
            </div>

            <!-- Botón de Confirmación del Plan -->
            <div class="pt-3 border-t border-[#f7f5f4]/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <p id="plan-modal-selected-summary" class="text-xs text-[#c9a3b1]"></p>
              <button
                type="button"
                id="btn-confirm-plan-choice"
                class="btn-iso-primary px-7 py-3 text-xs sm:text-sm font-medium cursor-pointer shrink-0"
              >
                Elegir este Plan y Continuar
              </button>
            </div>

          </div>
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- MODAL 1: PAGO DEL 50% VÍA TRANSFERENCIA + SUBIDA OBLIGATORIA       -->
      <!-- ================================================================== -->
      <div
        id="transfer-50-modal"
        class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-modal-title"
      >
        <div class="iso-card max-w-2xl w-full p-6 sm:p-7 border border-[#D795B7]/45 space-y-5 max-h-[94vh] overflow-y-auto animate-view-enter">
          
          <div class="flex items-start justify-between gap-3 border-b border-[#f7f5f4]/10 pb-4">
            <div>
              <span class="badge-grace text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full font-semibold inline-block mb-2">
                Requisito de Reserva • Pago del 50%
              </span>
              <h3 id="transfer-modal-title" class="font-serif-editorial text-2xl sm:text-3xl text-[#f7f5f4]">
                 Realiza tu transferencia y anexa el comprobante
              </h3>
              <p class="text-xs text-[#c9a3b1] mt-1 leading-relaxed">
                ¡Hola <strong id="transfer-client-name" class="text-[#f7f5f4]"></strong>! Para evitar reservas sin confirmar y asegurar tu fecha en <strong class="text-[#f7f5f4]">ISO Estudio</strong>, realiza la transferencia del <strong class="text-[#E3B8D0]">50%</strong> y sube la captura de tu comprobante aquí debajo:
              </p>
            </div>
            <button
              type="button"
              id="btn-close-transfer-modal"
              aria-label="Cerrar ventana"
              class="btn-iso-secondary w-9 h-9 flex items-center justify-center text-[#c9a3b1] hover:text-[#f7f5f4] shrink-0 cursor-pointer"
            >
              &times;
            </button>
          </div>

          <!-- PASO A DEL MODAL: Cuentas Bancarias Oficiales (Sin imagen blanca lateral) -->
          <div class="space-y-3">
            <span class="text-[11px] uppercase tracking-[0.15em] text-[#D795B7] font-semibold block">
              1. Cuentas de ahorro oficiales
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${BANK_ACCOUNTS_INFO.accounts
                .map(
                  (acc) => `
                <div class="bg-[#0a0a0a] border border-[#f7f5f4]/10 rounded-xl p-3.5 flex items-center justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full" style="background:${acc.accent}"></span>
                      <span class="text-xs font-semibold text-[#f7f5f4] uppercase tracking-wider">${acc.bank}</span>
                      <span class="text-[10px] text-[#c9a3b1]">(${BANK_ACCOUNTS_INFO.accountType})</span>
                    </div>
                    <p class="font-mono-code text-base text-[#E3B8D0] font-medium mt-1 tracking-wide">
                      ${acc.number}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-copy="${acc.number}"
                    data-copy-label="Cuenta ${acc.shortName}"
                    class="btn-copy-bank btn-iso-secondary px-3 py-1.5 text-[11px] font-medium text-[#f7f5f4] shrink-0 cursor-pointer"
                  >
                    Copiar
                  </button>
                </div>
              `
                )
                .join('')}
            </div>

            <div class="bg-[#141114] border border-[#D795B7]/25 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2">
                <span class="text-[#c9a3b1]">Titular:</span>
                <strong class="text-[#f7f5f4] font-medium">${BANK_ACCOUNTS_INFO.holderName}</strong>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[#c9a3b1]">Cédula:</span>
                <strong class="font-mono-code text-[#f7f5f4]">${BANK_ACCOUNTS_INFO.holderId}</strong>
                <button
                  type="button"
                  data-copy="${BANK_ACCOUNTS_INFO.holderId}"
                  data-copy-label="Cédula"
                  class="btn-copy-bank text-[10px] underline text-[#E3B8D0] hover:text-[#f7f5f4] cursor-pointer ml-1"
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>

          <!-- PASO B DEL MODAL: Subir Comprobante de la Transferencia (OBLIGATORIO) -->
          <div class="bg-[#0a0a0a]/90 border border-[#D795B7]/40 rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs uppercase tracking-[0.14em] text-[#E3B8D0] font-semibold">
                2. Anexa la foto o captura de tu transferencia (Obligatorio) *
              </span>
              <span id="receipt-status-badge" class="badge-warning text-[10px] px-2.5 py-0.5 rounded-full font-medium">
                Pendiente subir imagen
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center">
              <div class="sm:col-span-7 space-y-2.5">
                <label
                  for="receipt-file-input"
                  class="flex flex-col items-center justify-center border border-dashed border-[#D795B7]/50 hover:border-[#E3B8D0] bg-[#161014] hover:bg-[#1f151a] rounded-xl p-4 text-center cursor-pointer transition min-h-[104px]"
                >
                  <svg class="w-6 h-6 text-[#D795B7] mb-1.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span id="receipt-upload-label" class="text-xs font-medium text-[#f7f5f4]">
                    Haz clic aquí para subir la foto/captura del pago
                  </span>
                  <span class="text-[11px] text-[#c9a3b1] mt-0.5">
                    Formatos admitidos: JPG, PNG, WEBP
                  </span>
                  <input
                    type="file"
                    id="receipt-file-input"
                    accept="image/*"
                    class="hidden"
                  />
                </label>

                <input
                  type="text"
                  id="receipt-reference-note"
                  placeholder="Opcional: Banco desde el que transferiste o # referencia"
                  class="iso-input text-xs"
                />
              </div>

              <!-- Vista Previa de la Imagen del Comprobante -->
              <div class="sm:col-span-5 flex flex-col items-center justify-center min-h-[120px] bg-[#141114] border border-[#f7f5f4]/10 rounded-xl p-2.5">
                <div id="receipt-preview-empty" class="text-center text-[11px] text-[#c9a3b1] px-2">
                  Aquí verás la vista previa de tu comprobante antes de enviar.
                </div>
                <div id="receipt-preview-container" class="hidden flex-col items-center w-full">
                  <img
                    id="receipt-preview-img"
                    src=""
                    alt="Vista previa del comprobante"
                    class="max-h-32 w-auto rounded-lg object-contain border border-[#D795B7]/40"
                  />
                  <button
                    type="button"
                    id="btn-remove-receipt"
                    class="text-[11px] text-[#fda4af] underline mt-1.5 cursor-pointer"
                  >
                    Cambiar imagen
                  </button>
                </div>
              </div>
            </div>

            <div id="modal-receipt-error" class="hidden text-xs text-[#fda4af] bg-[#fda4af]/10 border border-[#fda4af]/30 rounded-lg px-3 py-2"></div>
          </div>

          <!-- Aviso de cómo se le confirmará la cita -->
          <div class="rounded-xl bg-[#D795B7]/10 border border-[#D795B7]/35 p-3.5 text-xs text-[#f7f5f4] space-y-1 leading-relaxed">
            <div class="font-semibold text-[#E3B8D0] flex items-center gap-2">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Validación por Esther en el Dashboard</span>
            </div>
            <p id="transfer-response-notice" class="text-[#c9a3b1]"></p>
          </div>

          <!-- Botones de Acción del Modal -->
          <div class="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[#f7f5f4]/10">
            <button
              type="button"
              id="btn-back-to-form"
              class="btn-iso-secondary sm:w-auto px-4 py-2.5 text-xs font-medium cursor-pointer"
            >
              Volver y editar datos
            </button>
            <button
              type="button"
              id="btn-confirm-final-booking"
              class="btn-iso-primary flex-1 py-3 px-5 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Anexar Comprobante y Enviar Reserva</span>
              <svg class="w-4 h-4 text-[#E3B8D0]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- MODAL 2: COMPROBANTE DEL CLIENTE (PARA QUE LO GUARDE ÉL)           -->
      <!-- ================================================================== -->
      <div
        id="booking-success-modal"
        class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden"
        role="dialog"
        aria-modal="true"
      >
        <div class="iso-card max-w-lg w-full p-6 sm:p-8 border border-[#D795B7]/45 space-y-5 max-h-[92vh] overflow-y-auto animate-view-enter">
          <div class="flex items-center justify-between">
            <span class="badge-arrived text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full font-semibold">
              Pago Anexado • En Revisión
            </span>
            <span id="modal-booking-code" class="font-mono-code text-xs text-[#E3B8D0] font-medium"></span>
          </div>

          <div>
            <h3 class="font-serif-editorial text-3xl text-[#f7f5f4]">
              ¡Guarda tu comprobante de reserva!
            </h3>
            <p id="modal-success-channel-msg" class="text-xs text-[#c9a3b1] mt-1 leading-relaxed"></p>
          </div>

          <div id="modal-booking-details" class="bg-[#0a0a0a] border border-[#f7f5f4]/10 rounded-xl p-4 space-y-2 text-xs"></div>

          <!-- Miniatura del comprobante que subió el cliente -->
          <div class="bg-[#141114] border border-[#f7f5f4]/10 rounded-xl p-3 flex items-center gap-3">
            <img
              id="modal-success-voucher-img"
              src=""
              alt="Comprobante anexado"
              class="w-16 h-16 rounded-lg object-cover border border-[#D795B7]/40 shrink-0"
            />
            <div class="text-xs space-y-0.5">
              <strong class="text-[#E3B8D0] block">Comprobante del 50% anexado correctamente</strong>
              <span class="text-[#c9a3b1] block">
                Esther revisará la transferencia en el panel y cambiará el estado de tu cita a Aceptada.
              </span>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              id="btn-print-ticket"
              class="btn-iso-primary flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg class="w-4 h-4 text-[#E3B8D0]" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Descargar / Imprimir mi Comprobante</span>
            </button>
            <button
              type="button"
              id="btn-close-success"
              class="btn-iso-secondary sm:w-auto py-3 px-5 text-xs font-medium cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  `

  // Referencias al DOM
  const servicesGrid = container.querySelector('#services-grid')
  const timeSlotsGrid = container.querySelector('#time-slots-grid')
  const form = container.querySelector('#booking-form')
  const inputName = container.querySelector('#client_name')
  const inputEmail = container.querySelector('#client_email')
  const inputPhone = container.querySelector('#client_phone')
  const inputPeople = container.querySelector('#people_count')
  const btnPeopleMinus = container.querySelector('#btn-people-minus')
  const btnPeoplePlus = container.querySelector('#btn-people-plus')
  const inputDate = container.querySelector('#appointment_date')
  const contactFeedback = container.querySelector('#contact-channel-feedback')
  const errorBox = container.querySelector('#booking-error')

  // Elementos del resumen
  const summaryServiceName = container.querySelector('#summary-service-name')
  const summaryCategoryBadge = container.querySelector('#summary-category-badge')
  const summaryPeople = container.querySelector('#summary-people')
  const summaryDate = container.querySelector('#summary-date')
  const summaryTime = container.querySelector('#summary-time')
  const summaryPrice = container.querySelector('#summary-price')
  const summaryDeposit = container.querySelector('#summary-deposit')
  const summaryGraceTitle = container.querySelector('#summary-grace-title')
  const summaryGraceDesc = container.querySelector('#summary-grace-desc')
  const graceInlineHint = container.querySelector('#grace-inline-hint')

  // Modal 1: Transferencia 50% + Subida de Comprobante
  const transferModal = container.querySelector('#transfer-50-modal')
  const transferClientName = container.querySelector('#transfer-client-name')
  const transferResponseNotice = container.querySelector('#transfer-response-notice')
  const btnCloseTransferModal = container.querySelector('#btn-close-transfer-modal')
  const btnBackToForm = container.querySelector('#btn-back-to-form')
  const btnConfirmFinalBooking = container.querySelector('#btn-confirm-final-booking')

  const receiptFileInput = container.querySelector('#receipt-file-input')
  const receiptUploadLabel = container.querySelector('#receipt-upload-label')
  const receiptStatusBadge = container.querySelector('#receipt-status-badge')
  const receiptPreviewEmpty = container.querySelector('#receipt-preview-empty')
  const receiptPreviewContainer = container.querySelector('#receipt-preview-container')
  const receiptPreviewImg = container.querySelector('#receipt-preview-img')
  const btnRemoveReceipt = container.querySelector('#btn-remove-receipt')
  const receiptReferenceNote = container.querySelector('#receipt-reference-note')
  const modalReceiptError = container.querySelector('#modal-receipt-error')

  // Modal 2: Éxito y Comprobante del Cliente
  const successModal = container.querySelector('#booking-success-modal')
  const modalBookingCode = container.querySelector('#modal-booking-code')
  const modalSuccessChannelMsg = container.querySelector('#modal-success-channel-msg')
  const modalBookingDetails = container.querySelector('#modal-booking-details')
  const modalSuccessVoucherImg = container.querySelector('#modal-success-voucher-img')
  const btnPrintTicket = container.querySelector('#btn-print-ticket')
  const btnCloseSuccess = container.querySelector('#btn-close-success')

  function updateContactFeedback() {
    if (!contactFeedback) return
    const email = inputEmail?.value.trim() || ''
    const phone = inputPhone?.value.trim() || ''
    contactFeedback.textContent = describeCustomerResponseChannel(email, phone)
  }

  inputEmail?.addEventListener('input', updateContactFeedback)
  inputPhone?.addEventListener('input', updateContactFeedback)

  function resetReceiptUploadUI() {
    uploadedReceiptDataUrl = ''
    if (receiptFileInput) receiptFileInput.value = ''
    if (receiptReferenceNote) receiptReferenceNote.value = ''
    if (receiptUploadLabel) {
      receiptUploadLabel.textContent = 'Haz clic aquí para subir la foto/captura del pago'
    }
    if (receiptStatusBadge) {
      receiptStatusBadge.className =
        'badge-warning text-[10px] px-2.5 py-0.5 rounded-full font-medium'
      receiptStatusBadge.textContent = 'Pendiente subir imagen'
    }
    receiptPreviewEmpty?.classList.remove('hidden')
    receiptPreviewContainer?.classList.add('hidden')
    modalReceiptError?.classList.add('hidden')
  }

  // Manejo de subida de imagen del comprobante del 50%
  receiptFileInput?.addEventListener('change', async () => {
    modalReceiptError?.classList.add('hidden')
    const file = receiptFileInput.files?.[0]
    if (!file) return

    try {
      if (receiptUploadLabel) receiptUploadLabel.textContent = 'Procesando imagen...'
      const compressedDataUrl = await compressReceiptImage(file)
      uploadedReceiptDataUrl = compressedDataUrl

      if (receiptPreviewImg) receiptPreviewImg.src = compressedDataUrl
      receiptPreviewEmpty?.classList.add('hidden')
      receiptPreviewContainer?.classList.remove('hidden')
      receiptPreviewContainer?.classList.add('flex')

      if (receiptUploadLabel) receiptUploadLabel.textContent = `Archivo listo: ${file.name}`
      if (receiptStatusBadge) {
        receiptStatusBadge.className =
          'badge-arrived text-[10px] px-2.5 py-0.5 rounded-full font-medium'
        receiptStatusBadge.textContent = 'Comprobante anexado'
      }
      showToast('Comprobante de transferencia anexado', 'success')
    } catch (err) {
      if (modalReceiptError) {
        modalReceiptError.textContent = err.message || 'No se pudo cargar la imagen.'
        modalReceiptError.classList.remove('hidden')
      }
    }
  })

  btnRemoveReceipt?.addEventListener('click', () => {
    resetReceiptUploadUI()
  })

  // Modal 0: Selector de Planes y Vista Previa de Sesión
  const sessionPlanModal = container.querySelector('#session-plan-modal')
  const planModalBgImg = container.querySelector('#plan-modal-bg-img')
  const planModalBgOverlay = container.querySelector('#plan-modal-bg-overlay')
  const planModalTitle = container.querySelector('#plan-modal-title')
  const planModalSubtitle = container.querySelector('#plan-modal-subtitle')
  const planModalShowcaseMedia = container.querySelector('#plan-modal-showcase-media')
  const planModalGracePill = container.querySelector('#plan-modal-grace-pill')
  const planModalFlyerLink = container.querySelector('#plan-modal-flyer-link')
  const planModalCardsGrid = container.querySelector('#plan-modal-cards-grid')
  const planModalSelectedSummary = container.querySelector('#plan-modal-selected-summary')
  const btnClosePlanModal = container.querySelector('#btn-close-plan-modal')
  const btnConfirmPlanChoice = container.querySelector('#btn-confirm-plan-choice')

  function getEffectivePrice() {
    if (selectedService?.slug === 'foto-navidena') {
      return selectedPlan?.price ?? null
    }
    if (selectedPlan && selectedPlan.price) return selectedPlan.price
    if (selectedService && selectedService.price) return selectedService.price
    return null
  }

  function renderPlanModalCards(service) {
    if (!planModalCardsGrid) return
    const cfg = getPlansConfigForService(service)
    const plans = cfg.plans || []

    // Si son 2 planes (ej. Infantil o Foto Navideña) usamos 2 columnas; si son 3 planes (Básico, Estándar, Premium) 3 columnas
    planModalCardsGrid.className =
      plans.length === 3
        ? 'grid grid-cols-1 md:grid-cols-3 gap-4'
        : 'grid grid-cols-1 sm:grid-cols-2 gap-4'

    planModalCardsGrid.innerHTML = plans
      .map((plan) => {
        const isChosen = selectedPlan?.id === plan.id
        const cardBg = plan.cardImage || cfg.headerImage
        return `
          <div
            data-plan-id="${plan.id}"
            class="plan-choice-card group relative overflow-hidden rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between ${
              isChosen
                ? 'border-[#D795B7] shadow-[0_0_0_1px_rgba(215,149,183,0.55)]'
                : 'border-[#f7f5f4]/15 hover:border-[#D795B7]/55'
            }"
          >
            <!-- Imagen HD de fondo en cada tarjeta del plan -->
            <div class="absolute inset-0 pointer-events-none">
              <img
                src="${cardBg}"
                alt="${plan.name}"
                class="w-full h-full object-cover object-[center_25%] ${
                  isChosen ? 'opacity-30 scale-105' : 'opacity-20 group-hover:opacity-30 group-hover:scale-105'
                } transition-all duration-500"
              />
              <div class="absolute inset-0 bg-gradient-to-b ${
                isChosen
                  ? 'from-[#1f151a]/80 via-[#181115]/88 to-[#120d10]/95'
                  : 'from-[#141114]/82 via-[#120f12]/90 to-[#0e0b0e]/96'
              }"></div>
            </div>

            <div class="relative z-10 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <span class="text-[10px] uppercase tracking-[0.16em] text-[#E3B8D0] font-semibold block">
                    ${plan.badge || 'Plan ISO Estudio'}
                  </span>
                  <h4 class="font-serif-editorial text-2xl text-[#f7f5f4] font-semibold mt-0.5">
                    ${plan.name}
                  </h4>
                </div>
                <span class="w-5 h-5 rounded-full border ${
                  isChosen ? 'border-[#D795B7] bg-[#D795B7]' : 'border-[#f7f5f4]/30'
                } flex items-center justify-center shrink-0 mt-1">
                  ${
                    isChosen
                      ? '<svg class="w-3 h-3 text-[#0a0a0a]" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
                      : ''
                  }
                </span>
              </div>

              <ul class="space-y-1.5 text-xs text-[#c9a3b1] pt-1 border-t border-[#f7f5f4]/12">
                ${plan.features
                  .map(
                    (feat) => `
                  <li class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#D795B7] shrink-0"></span>
                    <span class="text-[#f7f5f4]/95">${feat}</span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
            </div>

            <div class="relative z-10 mt-5 pt-3 border-t border-[#f7f5f4]/12 flex items-end justify-between">
              <div>
                <span class="text-[10px] uppercase tracking-wider text-[#c9a3b1] block">Inversión total</span>
                <strong class="font-mono-code text-xl text-[#f7f5f4] font-semibold">
                  ${formatPriceSlot(plan.price)}
                </strong>
              </div>
              <div class="text-right">
                <span class="text-[10px] uppercase tracking-wider text-[#E3B8D0] block">Reserva con 50%</span>
                <strong class="font-mono-code text-xs text-[#86efac]">
                  ${formatDeposit50(plan.price)}
                </strong>
              </div>
            </div>
          </div>
        `
      })
      .join('')

    if (planModalSelectedSummary && selectedPlan) {
      planModalSelectedSummary.innerHTML = `Seleccionado: <strong class="text-[#f7f5f4]">${service.name} — ${selectedPlan.name}</strong> (<strong class="text-[#E3B8D0]">${formatPriceSlot(selectedPlan.price)}</strong> • Abono 50%: <strong class="text-[#86efac]">${formatDeposit50(selectedPlan.price)}</strong>)`
    }

    planModalCardsGrid.querySelectorAll('.plan-choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        const planId = card.getAttribute('data-plan-id')
        const foundPlan = plans.find((p) => p.id === planId)
        if (foundPlan) {
          selectedPlan = foundPlan
          renderPlanModalCards(service)
          renderServices()
          updateSummary()
        }
      })
    })
  }

  function openSessionPlanModal(service) {
    if (!service || !sessionPlanModal) return
    const cfg = getPlansConfigForService(service)

    // Si el plan actual no pertenece a esta sesión, seleccionamos el primer plan por defecto
    if (!selectedPlan || !cfg.plans.some((p) => p.id === selectedPlan.id)) {
      selectedPlan = cfg.plans[0]
    }

    if (planModalTitle) {
      planModalTitle.textContent =
        service.slug === 'infantil'
          ? 'Planes Fotográficos para Niños (Infantil)'
          : `Planes — ${service.name}`
    }
    if (planModalSubtitle) planModalSubtitle.textContent = cfg.subtitle

    // En Foto Navideña la foto del set navideño es protagonista en el fondo del modal
    if (planModalBgImg) {
      planModalBgImg.src = cfg.modalBgImage
      planModalBgImg.className = cfg.isFullModalBg
        ? 'w-full h-full object-cover object-center opacity-55 transition-opacity duration-500'
        : 'w-full h-full object-cover object-center opacity-30 blur-[2px] transition-opacity duration-500'
    }
    if (planModalBgOverlay) {
      planModalBgOverlay.className = cfg.isFullModalBg
        ? 'absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/55 via-[#141114]/75 to-[#0a0a0a]/95'
        : 'absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/75 via-[#141114]/86 to-[#0a0a0a]/95'
    }

    if (planModalShowcaseMedia) {
      const gallery = Array.isArray(cfg.galleryImages) && cfg.galleryImages.length > 0
        ? cfg.galleryImages
        : [cfg.headerImage]

      if (gallery.length >= 2) {
        planModalShowcaseMedia.innerHTML = `
          <div class="grid grid-cols-2 gap-1.5 bg-[#0a0a0a]">
            <img
              src="${gallery[0]}"
              alt="${service.name} 1"
              class="w-full h-56 sm:h-68 object-cover object-[center_20%]"
            />
            <img
              src="${gallery[1]}"
              alt="${service.name} 2"
              class="w-full h-56 sm:h-68 object-cover object-[center_20%]"
            />
          </div>
        `
      } else {
        planModalShowcaseMedia.innerHTML = `
          <img
            src="${gallery[0]}"
            alt="${service.name}"
            class="w-full h-56 sm:h-68 object-cover ${
              service.slug === 'retrato' ? 'object-[center_30%]' : 'object-center'
            }"
          />
        `
      }
    }

    if (planModalGracePill) {
      planModalGracePill.textContent = `+${service.grace_minutes || 25} min de gracia incluidos`
    }
    if (planModalFlyerLink) {
      planModalFlyerLink.href = cfg.flyerUrl
      planModalFlyerLink.textContent =
        service.slug === 'foto-navidena' ? 'Ver foto del set navideño' : 'Ver afiche de precios'
    }

    renderPlanModalCards(service)
    sessionPlanModal.classList.remove('hidden')
  }

  btnClosePlanModal?.addEventListener('click', () => {
    sessionPlanModal?.classList.add('hidden')
  })

  btnConfirmPlanChoice?.addEventListener('click', () => {
    sessionPlanModal?.classList.add('hidden')
    renderServices()
    updateSummary()
    showToast(
      `Elegiste ${selectedService.name} — ${selectedPlan.name} (${formatPriceSlot(selectedPlan.price)})`,
      'success'
    )
  })

  sessionPlanModal?.addEventListener('click', (e) => {
    if (e.target === sessionPlanModal) {
      sessionPlanModal.classList.add('hidden')
    }
  })

  function renderServices() {
    if (!servicesGrid) return
    servicesGrid.innerHTML = services
      .map((srv) => {
        const isSelected = selectedService?.slug === srv.slug
        const isNavidad = srv.slug === 'foto-navidena' || srv.is_featured
        const cfg = getPlansConfigForService(srv)
        const minPrice =
          srv.slug === 'foto-navidena'
            ? cfg.plans?.[0]?.price ?? null
            : cfg.plans?.[0]?.price || srv.price
        const plansCount = cfg.plans?.length || 2

        return `
          <button
            type="button"
            data-service-slug="${srv.slug}"
            class="service-option group w-full overflow-hidden text-left px-5 py-4 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isSelected
                ? 'bg-[#1f151a] border-[#D795B7] shadow-[0_0_0_1px_rgba(215,149,183,0.35)]'
                : 'bg-[#141114] border-[#f7f5f4]/10 hover:border-[#D795B7]/40 hover:bg-[#1f151a]/60'
            }"
          >
            <div class="flex items-center gap-3.5 min-w-0">
              <span class="w-4 h-4 rounded-full border ${
                isSelected ? 'border-[#D795B7] bg-[#D795B7]' : 'border-[#f7f5f4]/30'
              } flex items-center justify-center shrink-0">
                ${
                  isSelected
                    ? '<svg class="w-2.5 h-2.5 text-[#0a0a0a]" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
                    : ''
                }
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-serif-editorial text-xl font-semibold text-[#f7f5f4] leading-snug">
                    ${srv.slug === 'infantil' ? 'Infantil (Niños)' : srv.name}
                  </span>
                  ${
                    isNavidad
                      ? `<span class="badge-grace text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-semibold shrink-0">Temporada</span>`
                      : ''
                  }
                </div>
                <span class="text-xs text-[#c9a3b1] block mt-0.5">
                  +${srv.grace_minutes || 25} min de gracia • ${plansCount} planes disponibles
                </span>
              </div>
            </div>

            <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[#f7f5f4]/10 shrink-0">
              ${
                isSelected && selectedPlan
                  ? `<span class="font-mono-code text-sm text-[#f7f5f4] font-semibold">${formatPriceSlot(
                      selectedPlan.price
                    )}</span>
                     <span class="text-[11px] text-[#E3B8D0] font-medium">${selectedPlan.name} • Cambiar →</span>`
                  : `<span class="font-mono-code text-xs text-[#E3B8D0] font-medium">${
                      minPrice && Number(minPrice) > 0
                        ? `Desde ${formatPriceSlot(minPrice)}`
                        : formatPriceSlot(null)
                    }</span>
                     <span class="text-[11px] text-[#c9a3b1] group-hover:text-[#f7f5f4] transition-colors">Ver planes →</span>`
              }
            </div>
          </button>
        `
      })
      .join('')

    servicesGrid.querySelectorAll('.service-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-service-slug')
        const found = services.find((s) => s.slug === slug)
        if (found) {
          const isSwitchingService = selectedService?.slug !== found.slug
          selectedService = found
          if (isSwitchingService) {
            selectedPlan = getPlansConfigForService(found).plans[0]
          }
          if (found.slug === 'foto-navidena' || found.is_featured) {
            goToSlide(0)
            resetCarouselTimer()
          }
          renderServices()
          updateSummary()
          openSessionPlanModal(found)
        }
      })
    })
  }

  function renderTimeSlots() {
    if (!timeSlotsGrid) return
    const schedule = getScheduleForDate(selectedDate)
    const scheduleBadge = container.querySelector('#schedule-day-badge')
    if (scheduleBadge) {
      scheduleBadge.textContent = schedule.scheduleLabel
      scheduleBadge.className = schedule.isOpen
        ? 'text-[11px] text-[#E3B8D0] font-medium'
        : 'text-[11px] text-[#fda4af] font-medium'
    }

    if (!schedule.isOpen) {
      timeSlotsGrid.className = 'grid grid-cols-1'
      timeSlotsGrid.innerHTML = `
        <div class="rounded-xl bg-[#141114] border border-[#fda4af]/35 p-4 text-center space-y-2.5">
          <p class="text-xs text-[#fda4af] font-medium">
            Los sábados el estudio permanece cerrado.
          </p>
          <p class="text-[11px] text-[#c9a3b1]">
            Nuestro horario de atención es de <strong class="text-[#f7f5f4]">Lunes a Viernes (5:00 PM a 8:00 PM)</strong> y <strong class="text-[#f7f5f4]">Domingos (8:00 AM a 5:00 PM)</strong>.
          </p>
          <button
            type="button"
            id="btn-jump-sunday"
            class="btn-iso-primary px-4 py-2 text-xs font-medium cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Pasar al Domingo siguiente (8:00 AM – 5:00 PM)</span>
          </button>
        </div>
      `
      timeSlotsGrid.querySelector('#btn-jump-sunday')?.addEventListener('click', () => {
        const [y, m, d] = selectedDate.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const ny = nextDay.getFullYear()
        const nm = String(nextDay.getMonth() + 1).padStart(2, '0')
        const nd = String(nextDay.getDate()).padStart(2, '0')
        selectedDate = `${ny}-${nm}-${nd}`
        if (inputDate) inputDate.value = selectedDate
        const nextSched = getScheduleForDate(selectedDate)
        selectedTime = nextSched.slots[0] || '08:00'
        renderTimeSlots()
        updateSummary()
      })
      return
    }

    if (!schedule.slots.includes(selectedTime)) {
      selectedTime = schedule.slots[0]
    }

    timeSlotsGrid.className =
      schedule.slots.length <= 4
        ? 'grid grid-cols-2 sm:grid-cols-4 gap-2.5'
        : 'grid grid-cols-2 sm:grid-cols-5 gap-2.5'

    timeSlotsGrid.innerHTML = schedule.slots
      .map((slot) => {
        const active = selectedTime === slot
        return `
        <button
          type="button"
          data-time="${slot}"
          class="time-slot-btn min-h-[44px] rounded-xl font-mono-code text-xs font-medium border transition cursor-pointer ${
            active
              ? 'bg-[#D795B7]/20 border-[#D795B7] text-[#f7f5f4]'
              : 'bg-[#141114] border-[#f7f5f4]/10 text-[#c9a3b1] hover:text-[#f7f5f4] hover:border-[#D795B7]/40'
          }"
        >
          ${formatTime12h(slot)}
        </button>
      `
      })
      .join('')

    timeSlotsGrid.querySelectorAll('.time-slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTime = btn.getAttribute('data-time') || schedule.slots[0]
        renderTimeSlots()
        updateSummary()
      })
    })
  }

  function updateSummary() {
    if (!selectedService) return
    const graceMins = selectedService.grace_minutes || 25
    const schedule = getScheduleForDate(selectedDate)
    const { limit12 } = calculateGraceLimit(selectedTime || '17:00', graceMins)
    const time12 = schedule.isOpen && selectedTime ? formatTime12h(selectedTime) : 'Cerrado (Sábado)'
    const effectivePrice = getEffectivePrice()

    if (summaryServiceName) {
      summaryServiceName.textContent = selectedPlan
        ? `${selectedService.name} — ${selectedPlan.name}`
        : selectedService.name
    }
    if (summaryCategoryBadge) summaryCategoryBadge.textContent = selectedService.category || 'Estudio'
    if (summaryPeople) {
      summaryPeople.textContent = `${peopleCount} ${peopleCount === 1 ? 'persona' : 'personas'}`
    }
    if (summaryDate) summaryDate.textContent = formatDateSpanish(selectedDate)
    if (summaryTime) summaryTime.textContent = time12
    if (summaryPrice) summaryPrice.textContent = formatPriceSlot(effectivePrice)
    if (summaryDeposit) summaryDeposit.textContent = formatDeposit50(effectivePrice)

    if (summaryGraceTitle) {
      summaryGraceTitle.textContent = `Tiempo de gracia: ${graceMins} minutos`
    }
    if (summaryGraceDesc) {
      summaryGraceDesc.innerHTML = schedule.isOpen
        ? `Tu reserva a las <strong class="text-[#f7f5f4]">${time12}</strong> cuenta con tolerancia hasta las <strong class="text-[#E3B8D0]">${limit12}</strong> para llegar sin perder la cita.`
        : `Los sábados el estudio permanece cerrado. Selecciona una fecha de <strong class="text-[#f7f5f4]">Lunes a Viernes (5:00 PM a 8:00 PM)</strong> o <strong class="text-[#E3B8D0]">Domingos (8:00 AM a 5:00 PM)</strong>.`
    }
    if (graceInlineHint) {
      graceInlineHint.textContent = schedule.isOpen
        ? `Límite de llegada: ${limit12}`
        : 'Estudio cerrado los sábados'
    }
  }

  async function fetchServices() {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('id', { ascending: true })

    if (!error && Array.isArray(data) && data.length > 0) {
      const filtered = data.filter((s) => ALLOWED_SERVICE_SLUGS.includes(s.slug))
      services = filtered.length > 0 ? filtered : [...DEFAULT_SERVICES]
      const currentStillExists = services.find((s) => s.slug === selectedService?.slug)
      selectedService = currentStillExists || services[0]
      if (!selectedPlan) {
        selectedPlan = getPlansConfigForService(selectedService).plans[0]
      }
      renderServices()
      updateSummary()
    }
  }

  btnPeopleMinus?.addEventListener('click', () => {
    peopleCount = Math.max(1, Number(inputPeople.value || 1) - 1)
    inputPeople.value = String(peopleCount)
    updateSummary()
  })

  btnPeoplePlus?.addEventListener('click', () => {
    peopleCount = Math.min(20, Number(inputPeople.value || 1) + 1)
    inputPeople.value = String(peopleCount)
    updateSummary()
  })

  inputPeople?.addEventListener('input', () => {
    const val = parseInt(inputPeople.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      peopleCount = Math.min(20, val)
      updateSummary()
    }
  })

  inputDate?.addEventListener('change', () => {
    selectedDate = inputDate.value || todayStr
    renderTimeSlots()
    updateSummary()
  })

  container.querySelectorAll('.btn-copy-bank').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.getAttribute('data-copy') || ''
      const label = btn.getAttribute('data-copy-label') || 'Dato'
      try {
        await navigator.clipboard.writeText(val)
        showToast(`${label} copiado: ${val}`, 'success')
      } catch {
        showToast(`${label}: ${val}`, 'info')
      }
    })
  })

  // PASO A: Validar formulario y lanzar el Modal de Transferencia 50% + Subida de Comprobante
  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    errorBox?.classList.add('hidden')

    const scheduleCheck = getScheduleForDate(selectedDate)
    if (!scheduleCheck.isOpen || !selectedTime) {
      errorBox.textContent =
        'Los sábados el estudio está cerrado. Por favor selecciona una fecha de Lunes a Viernes (5:00 PM a 8:00 PM) o Domingo (8:00 AM a 5:00 PM).'
      errorBox.classList.remove('hidden')
      inputDate?.focus()
      return
    }

    const clientName = inputName?.value.trim() || ''
    const clientEmail = inputEmail?.value.trim() || ''
    const rawPhone = inputPhone?.value.trim() || ''
    const cleanPhoneDigits = rawPhone.replace(/\D/g, '')
    const formattedPhone = cleanPhoneDigits ? `+1 ${rawPhone.replace(/^\+?1\s*/, '')}` : ''
    const count = Math.max(1, parseInt(inputPeople?.value || '1', 10))

    if (!clientName) {
      errorBox.textContent = 'Por favor escribe tu nombre completo.'
      errorBox.classList.remove('hidden')
      inputName?.focus()
      return
    }

    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)
    const hasValidPhone = cleanPhoneDigits.length >= 7

    if (!hasValidPhone) {
      errorBox.textContent =
        'Por favor ingresa tu número telefónico (+1) para poder responderte por WhatsApp o llamada.'
      errorBox.classList.remove('hidden')
      inputPhone?.focus()
      return
    }

    if (clientEmail && !hasValidEmail) {
      errorBox.textContent = 'El formato del correo electrónico no es válido.'
      errorBox.classList.remove('hidden')
      inputEmail?.focus()
      return
    }

    const fullServiceName = selectedPlan
      ? `${selectedService?.name || 'Foto Navideña'} — ${selectedPlan.name}`
      : selectedService?.name || 'Foto Navideña'

    pendingDraft = {
      booking_code: generateBookingCode(),
      client_name: clientName,
      client_email: clientEmail,
      client_phone: formattedPhone || 'No proporcionado (Solo correo)',
      service_id: selectedService?.id || null,
      service_name: fullServiceName,
      people_count: count,
      appointment_date: selectedDate,
      appointment_time: selectedTime,
      grace_minutes: selectedService?.grace_minutes || 25,
      status: 'pendiente',
      estimated_price: getEffectivePrice(),
    }

    if (transferClientName) transferClientName.textContent = clientName
    if (transferResponseNotice) {
      transferResponseNotice.textContent = describeCustomerResponseChannel(clientEmail, rawPhone)
    }

    modalReceiptError?.classList.add('hidden')
    transferModal?.classList.remove('hidden')
  })

  btnCloseTransferModal?.addEventListener('click', () => {
    transferModal?.classList.add('hidden')
  })

  btnBackToForm?.addEventListener('click', () => {
    transferModal?.classList.add('hidden')
  })

  // PASO B: Verificar que el cliente haya subido la imagen del comprobante del 50% antes de crear la cita
  btnConfirmFinalBooking?.addEventListener('click', async () => {
    if (!pendingDraft) return
    modalReceiptError?.classList.add('hidden')

    if (!uploadedReceiptDataUrl) {
      if (modalReceiptError) {
        modalReceiptError.textContent =
          'Para enviar tu reserva es obligatorio anexar la foto o captura del comprobante de transferencia del 50%.'
        modalReceiptError.classList.remove('hidden')
      }
      showToast('Anexa la imagen del comprobante del 50% para continuar', 'warning')
      return
    }

    btnConfirmFinalBooking.disabled = true
    const originalHTML = btnConfirmFinalBooking.innerHTML
    btnConfirmFinalBooking.innerHTML = `<span>Enviando reserva y comprobante...</span>`

    const referenceNote = receiptReferenceNote?.value.trim() || ''
    const clientNotesMeta = serializeClientMeta({
      email: pendingDraft.client_email,
      paymentProof: uploadedReceiptDataUrl,
      referenceNote,
    })

    const dbPayload = {
      booking_code: pendingDraft.booking_code,
      client_name: pendingDraft.client_name,
      client_phone: pendingDraft.client_phone,
      service_id: pendingDraft.service_id,
      service_name: pendingDraft.service_name,
      people_count: pendingDraft.people_count,
      appointment_date: pendingDraft.appointment_date,
      appointment_time: pendingDraft.appointment_time,
      grace_minutes: pendingDraft.grace_minutes,
      status: 'pendiente',
      estimated_price: pendingDraft.estimated_price,
      client_notes: clientNotesMeta,
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert([dbPayload])
      .select()
      .single()

    btnConfirmFinalBooking.disabled = false
    btnConfirmFinalBooking.innerHTML = originalHTML

    if (error) {
      showToast(`No se pudo registrar la reserva: ${error.message}`, 'error')
      return
    }

    transferModal?.classList.add('hidden')
    lastCreatedBooking = {
      ...dbPayload,
      ...(data || {}),
    }

    const { limit12 } = calculateGraceLimit(
      lastCreatedBooking.appointment_time,
      lastCreatedBooking.grace_minutes
    )
    const { email, phone, paymentProof, channelLabel } = extractContactInfo(lastCreatedBooking)

    if (modalBookingCode) modalBookingCode.textContent = lastCreatedBooking.booking_code
    if (modalSuccessChannelMsg) {
      modalSuccessChannelMsg.textContent = describeCustomerResponseChannel(
        email,
        phone.replace(/^\+1\s*/, '')
      )
    }
    if (modalSuccessVoucherImg && paymentProof) {
      modalSuccessVoucherImg.src = paymentProof
    }
    if (modalBookingDetails) {
      modalBookingDetails.innerHTML = `
        <div class="flex justify-between py-1 border-b border-[#f7f5f4]/5">
          <span class="text-[#c9a3b1]">Código de Reserva:</span>
          <span class="text-[#E3B8D0] font-mono-code font-medium">${lastCreatedBooking.booking_code}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-[#f7f5f4]/5">
          <span class="text-[#c9a3b1]">Cliente:</span>
          <span class="text-[#f7f5f4] font-medium">${lastCreatedBooking.client_name}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-[#f7f5f4]/5">
          <span class="text-[#c9a3b1]">Vía de confirmación:</span>
          <span class="text-[#f7f5f4] font-medium">${channelLabel}</span>
        </div>
        <div class="flex justify-between py-1 border-b border-[#f7f5f4]/5">
          <span class="text-[#c9a3b1]">Tipo de sesión:</span>
          <span class="text-[#f7f5f4] font-medium">${lastCreatedBooking.service_name} (${lastCreatedBooking.people_count} pers.)</span>
        </div>
        <div class="flex justify-between py-1 border-b border-[#f7f5f4]/5">
          <span class="text-[#c9a3b1]">Fecha y Hora:</span>
          <span class="text-[#f7f5f4] font-mono-code">${formatDateSpanish(lastCreatedBooking.appointment_date)} • ${formatTime12h(lastCreatedBooking.appointment_time)}</span>
        </div>
        <div class="flex justify-between py-1">
          <span class="text-[#c9a3b1]">Tolerancia de llegada:</span>
          <span class="text-[#86efac] font-mono-code font-medium">Hasta las ${limit12} (+${lastCreatedBooking.grace_minutes}m)</span>
        </div>
      `
    }

    successModal?.classList.remove('hidden')
    showToast(`Reserva ${lastCreatedBooking.booking_code} y comprobante enviados`, 'success')

    form.reset()
    resetReceiptUploadUI()
    peopleCount = 2
    if (inputPeople) inputPeople.value = '2'
    if (inputDate) inputDate.value = selectedDate
    updateContactFeedback()
    updateSummary()
  })

  btnPrintTicket?.addEventListener('click', () => {
    if (lastCreatedBooking) printBookingTicket(lastCreatedBooking)
  })

  btnCloseSuccess?.addEventListener('click', () => {
    successModal?.classList.add('hidden')
  })

  // ==========================================================================
  // LÓGICA DEL CARRUSEL EN VIVO (FONDO GLASS + VISOR EDITORIAL SINCRONIZADOS)
  // ==========================================================================
  const bgSlides = container.querySelectorAll('.iso-bg-slide')
  const showcaseSlides = container.querySelectorAll('.iso-showcase-slide')
  const carouselCaption = container.querySelector('#carousel-caption')
  const carouselCounter = container.querySelector('#carousel-counter')
  const btnCarouselPrev = container.querySelector('#btn-carousel-prev')
  const btnCarouselNext = container.querySelector('#btn-carousel-next')

  function ensureSlideLoaded(index) {
    const safeIdx = (index + ISO_CAROUSEL_SLIDES.length) % ISO_CAROUSEL_SLIDES.length
    const bgImg = bgSlides[safeIdx]?.querySelector('img[data-src]')
    if (bgImg) {
      bgImg.src = bgImg.getAttribute('data-src')
      bgImg.removeAttribute('data-src')
    }
    const showImg = showcaseSlides[safeIdx]?.querySelector('img[data-src]')
    if (showImg) {
      showImg.src = showImg.getAttribute('data-src')
      showImg.removeAttribute('data-src')
    }
  }

  function goToSlide(targetIdx) {
    const total = ISO_CAROUSEL_SLIDES.length
    if (!total) return

    bgSlides[currentSlideIdx]?.classList.remove('active')
    showcaseSlides[currentSlideIdx]?.classList.remove('active')

    currentSlideIdx = (targetIdx + total) % total
    ensureSlideLoaded(currentSlideIdx)
    ensureSlideLoaded(currentSlideIdx + 1)

    bgSlides[currentSlideIdx]?.classList.add('active')
    showcaseSlides[currentSlideIdx]?.classList.add('active')

    if (carouselCaption) {
      carouselCaption.textContent = ISO_CAROUSEL_SLIDES[currentSlideIdx].tag
    }
    if (carouselCounter) {
      carouselCounter.textContent = `${String(currentSlideIdx + 1).padStart(2, '0')} / ${String(
        total
      ).padStart(2, '0')}`
    }
  }

  function resetCarouselTimer() {
    if (carouselTimer) clearInterval(carouselTimer)
    carouselTimer = setInterval(() => {
      goToSlide(currentSlideIdx + 1)
    }, 4500)
  }

  btnCarouselPrev?.addEventListener('click', () => {
    goToSlide(currentSlideIdx - 1)
    resetCarouselTimer()
  })

  btnCarouselNext?.addEventListener('click', () => {
    goToSlide(currentSlideIdx + 1)
    resetCarouselTimer()
  })

  resetCarouselTimer()

  renderServices()
  renderTimeSlots()
  updateSummary()
  fetchServices()

  return () => {
    if (carouselTimer) clearInterval(carouselTimer)
  }
}
