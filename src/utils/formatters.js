/**
 * Utilidades de formato, compresión de comprobante de transferencia 50%,
 * contacto (Correo + Teléfono +1) y tiempo de gracia (20–30 min) para ISO Estudio
 */

export const BANK_ACCOUNTS_INFO = {
  holderName: 'Esther Jiménez García',
  holderId: '402-3169758-8',
  accountType: 'Cuenta de ahorro',
  accounts: [
    {
      bank: 'Banco BHD',
      shortName: 'BHD',
      number: '34832270011',
      accent: '#4ade80',
    },
    {
      bank: 'Banreservas',
      shortName: 'BANRESERVAS',
      number: '9603171964',
      accent: '#38bdf8',
    },
  ],
}

export const APPOINTMENT_STATUSES = [
  { value: 'pendiente', label: 'Pendiente (Revisar pago 50%)', badgeClass: 'badge-warning' },
  { value: 'confirmada', label: 'Aceptada', badgeClass: 'badge-arrived' },
  { value: 'en_estudio', label: 'Aceptada • Llegó a tiempo', badgeClass: 'badge-arrived' },
  { value: 'completada', label: 'Cita Completada (Historial)', badgeClass: 'badge-grace' },
  { value: 'no_asistio', label: 'No llegó (Gracia vencida)', badgeClass: 'badge-expired' },
  { value: 'cancelada', label: 'Rechazada', badgeClass: 'badge-expired' },
]

/**
 * Comprime y redimensiona la imagen del comprobante bancario en el navegador
 * para que se guarde rápido y nítido en Supabase sin requerir configuración externa.
 */
export function compressReceiptImage(file, maxWidth = 960, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Selecciona un archivo de imagen válido (JPG, PNG, WEBP).'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
    reader.onload = (event) => {
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'))
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Empaqueta el correo electrónico y la imagen del comprobante de transferencia
 * para que se guarden sin fallar en Supabase
 */
export function serializeClientMeta({ email = '', paymentProof = '', referenceNote = '' }) {
  return JSON.stringify({
    email: email.trim(),
    paymentProof,
    referenceNote: referenceNote.trim(),
    uploadedAt: new Date().toISOString(),
  })
}

/**
 * Genera un código único legible para la reserva (ej. ISO-1025-482)
 */
export function generateBookingCode() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const random = Math.floor(100 + Math.random() * 900)
  return `ISO-${month}${day}-${random}`
}

/**
 * Convierte una hora "HH:MM" o "HH:MM:SS" a formato 12h legible (ej. "10:00 AM")
 */
export function formatTime12h(timeStr) {
  if (!timeStr) return '--:--'
  const [hStr, mStr] = timeStr.split(':')
  const hours24 = parseInt(hStr, 10)
  const minutes = mStr || '00'
  if (Number.isNaN(hours24)) return timeStr
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${minutes} ${period}`
}

/**
 * Calcula la hora límite exacta sumando los minutos de gracia (20 o 30 min) a la hora de la cita
 */
export function calculateGraceLimit(timeStr, graceMinutes = 25) {
  if (!timeStr) return { limit24: '--:--', limit12: '--:--' }
  const [hStr, mStr] = timeStr.split(':')
  const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr || '0', 10) + Number(graceMinutes)
  const limitHours = Math.floor(totalMinutes / 60) % 24
  const limitMins = totalMinutes % 60
  const limit24 = `${String(limitHours).padStart(2, '0')}:${String(limitMins).padStart(2, '0')}`
  return {
    limit24,
    limit12: formatTime12h(limit24),
  }
}

/**
 * Evalúa en qué estado se encuentra el tiempo de gracia de una reserva
 */
export function evaluateGraceStatus(appointmentDate, appointmentTime, graceMinutes = 25, status = 'pendiente') {
  const { limit12 } = calculateGraceLimit(appointmentTime, graceMinutes)

  if (status === 'en_estudio' || status === 'completada') {
    return {
      state: 'arrived',
      label: `Llegó a tiempo (Límite ${limit12})`,
      badgeClass: 'badge-arrived',
      limit12,
    }
  }

  if (status === 'cancelada') {
    return {
      state: 'rejected',
      label: `Tolerancia era hasta ${limit12}`,
      badgeClass: 'badge-expired',
      limit12,
    }
  }

  if (status === 'no_asistio') {
    return {
      state: 'expired',
      label: `No llegó (Límite ${limit12})`,
      badgeClass: 'badge-expired',
      limit12,
    }
  }

  if (!appointmentDate || !appointmentTime) {
    return {
      state: 'scheduled',
      label: `+${graceMinutes} min de gracia (hasta ${limit12})`,
      badgeClass: 'badge-grace',
      limit12,
    }
  }

  const [year, month, day] = appointmentDate.split('-').map(Number)
  const [hour, minute] = appointmentTime.split(':').map(Number)
  const startDate = new Date(year, month - 1, day, hour, minute, 0)
  const limitDate = new Date(startDate.getTime() + Number(graceMinutes) * 60 * 1000)
  const now = new Date()

  if (now < startDate) {
    return {
      state: 'upcoming',
      label: `Tolerancia hasta ${limit12} (+${graceMinutes} min)`,
      badgeClass: 'badge-grace',
      limit12,
    }
  }

  if (now >= startDate && now <= limitDate) {
    const remainingMins = Math.max(1, Math.ceil((limitDate - now) / 60000))
    return {
      state: 'in_grace',
      label: `En tiempo de gracia: quedan ${remainingMins} min (límite ${limit12})`,
      badgeClass: 'badge-warning',
      limit12,
    }
  }

  return {
    state: 'overdue',
    label: `Tiempo de gracia vencido (${limit12})`,
    badgeClass: 'badge-expired',
    limit12,
  }
}

/**
 * Formatea una fecha YYYY-MM-DD a texto en español
 */
export function formatDateSpanish(dateStr) {
  if (!dateStr) return 'Sin fecha'
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const formatted = date.toLocaleDateString('es-DO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/**
 * Formatea precio o devuelve el mensaje de espacio reservado cuando aún es NULL
 */
export function formatPriceSlot(price) {
  if (price === null || price === undefined || price === '') {
    return 'Precio por confirmar'
  }
  const num = Number(price)
  if (Number.isNaN(num) || num <= 0) return 'Precio por confirmar'
  return `RD$ ${num.toLocaleString('es-DO', { minimumFractionDigits: 0 })}`
}

/**
 * Calcula el 50% de abono para reserva vía transferencia
 */
export function formatDeposit50(price) {
  if (price === null || price === undefined || price === '') {
    return '50% del paquete elegido'
  }
  const num = Number(price)
  if (Number.isNaN(num) || num <= 0) return '50% del paquete elegido'
  const half = num / 2
  return `RD$ ${half.toLocaleString('es-DO', { minimumFractionDigits: 0 })} (50%)`
}

/**
 * Extrae el correo, teléfono (+1) y la imagen del comprobante de pago 50% de una cita
 */
export function extractContactInfo(appointment = {}) {
  let email = (appointment.client_email || '').trim()
  let phone = (appointment.client_phone || '').trim()
  let paymentProof = appointment.payment_proof_url || ''
  let referenceNote = ''

  if (appointment.client_notes) {
    const rawNotes = String(appointment.client_notes).trim()
    if (rawNotes.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawNotes)
        if (!email && parsed.email) email = String(parsed.email).trim()
        if (!paymentProof && parsed.paymentProof) paymentProof = parsed.paymentProof
        if (parsed.referenceNote) referenceNote = parsed.referenceNote
      } catch {
        // Ignorar si no es JSON
      }
    } else {
      const match = rawNotes.match(/\[EMAIL:([^\]]+)\]/i)
      if (match && match[1]) email = match[1].trim()
    }
  }

  if (phone === 'No proporcionado (Solo correo)') {
    phone = ''
  }

  const hasEmail = Boolean(email)
  const hasPhone = Boolean(phone)
  const hasPaymentProof = Boolean(paymentProof)

  let channelLabel = 'Sin vía de contacto'
  if (hasEmail && hasPhone) {
    channelLabel = 'Responder por Correo y Llamada/Tel.'
  } else if (hasEmail) {
    channelLabel = 'Responder por Correo Electrónico'
  } else if (hasPhone) {
    channelLabel = 'Responder por Llamada / Teléfono'
  }

  return {
    email,
    phone,
    paymentProof,
    referenceNote,
    hasEmail,
    hasPhone,
    hasPaymentProof,
    channelLabel,
  }
}

/**
 * Describe amigablemente para el cliente por qué medio se le responderá según lo que llenó
 */
export function describeCustomerResponseChannel(email, phone) {
  const hasEmail = Boolean(email && email.trim())
  const hasPhone = Boolean(phone && phone.replace(/\D/g, '').length >= 7)

  if (hasEmail && hasPhone) {
    return `Una vez Esther verifique tu comprobante del 50%, te confirmaremos tanto por correo electrónico (${email.trim()}) como vía llamada telefónica / WhatsApp (+1 ${phone.trim()}).`
  }
  if (hasEmail) {
    return `Una vez Esther verifique tu comprobante del 50%, te responderemos directamente a tu correo electrónico (${email.trim()}).`
  }
  if (hasPhone) {
    return `Una vez Esther verifique tu comprobante del 50%, te responderemos vía llamada telefónica o WhatsApp al +1 ${phone.trim()}.`
  }
  return 'Completa tu correo electrónico o tu número telefónico (+1) para poder responderte.'
}

/**
 * Genera el enlace directo a WhatsApp para que Esther le confirme al cliente que su pago del 50% fue verificado
 */
export function buildWhatsAppLink(appointment) {
  const { phone } = extractContactInfo(appointment)
  const cleanPhone = String(phone || '').replace(/\D/g, '')
  const phoneWithCountry = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone
  const { limit12 } = calculateGraceLimit(appointment.appointment_time, appointment.grace_minutes)

  const isAccepted =
    appointment.status === 'confirmada' ||
    appointment.status === 'en_estudio' ||
    appointment.status === 'completada'

  const message = isAccepted
    ? `¡Hola ${appointment.client_name}! Te escribe Esther de *ISO Estudio*. Hemos verificado tu comprobante del 50% y te confirmamos que todo está correcto: tu reserva (*${appointment.booking_code}*) queda *ACEPTADA*.\n\n` +
      `• Sesión: ${appointment.service_name}\n` +
      `• Personas: ${appointment.people_count}\n` +
      `• Fecha: ${formatDateSpanish(appointment.appointment_date)}\n` +
      `• Hora: ${formatTime12h(appointment.appointment_time)} (Recuerda que tienes tolerancia de llegada hasta las ${limit12})\n\n` +
      `¡Te esperamos en el estudio!`
    : `Hola ${appointment.client_name}, te escribimos de *ISO Estudio* respecto a tu solicitud de reserva (*${appointment.booking_code}*) para la sesión de *${appointment.service_name}* el ${formatDateSpanish(appointment.appointment_date)} a las ${formatTime12h(appointment.appointment_time)}.`

  return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
}

/**
 * Genera el enlace mailto: para que Esther le responda por correo electrónico confirmando que el pago y la cita están correctos
 */
export function buildEmailLink(appointment) {
  const { email } = extractContactInfo(appointment)
  if (!email) return '#'
  const { limit12 } = calculateGraceLimit(appointment.appointment_time, appointment.grace_minutes)

  const isAccepted =
    appointment.status === 'confirmada' ||
    appointment.status === 'en_estudio' ||
    appointment.status === 'completada'

  const subject = isAccepted
    ? `¡Cita Confirmada! Pago 50% Verificado (${appointment.booking_code}) — ISO Estudio`
    : `Información sobre tu Reserva ${appointment.booking_code} — ISO Estudio`

  const body = isAccepted
    ? `¡Hola ${appointment.client_name}!\n\n` +
      `Te escribimos de ISO Estudio para confirmarte que hemos verificado tu transferencia del 50% y todo está correcto. Tu cita ha sido ACEPTADA y agendada:\n\n` +
      `• Código de reserva: ${appointment.booking_code}\n` +
      `• Tipo de sesión: ${appointment.service_name}\n` +
      `• Cantidad de personas: ${appointment.people_count}\n` +
      `• Fecha: ${formatDateSpanish(appointment.appointment_date)}\n` +
      `• Hora reservada: ${formatTime12h(appointment.appointment_time)} (Cuentas con ${appointment.grace_minutes || 25} minutos de gracia, hasta las ${limit12})\n\n` +
      `¡Te esperamos en el estudio!\n` +
      `Esther Jiménez García • ISO Estudio (San Cristóbal, RD)`
    : `Hola ${appointment.client_name},\n\n` +
      `Te contactamos de ISO Estudio respecto a tu reserva (${appointment.booking_code}) para el día ${formatDateSpanish(appointment.appointment_date)} a las ${formatTime12h(appointment.appointment_time)}.\n\n` +
      `Saludos,\nEsther Jiménez García • ISO Estudio`

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
