import {
  formatDateSpanish,
  formatTime12h,
  calculateGraceLimit,
  formatPriceSlot,
  formatDeposit50,
  extractContactInfo,
  BANK_ACCOUNTS_INFO,
} from './formatters'

/**
 * Exporta el listado de citas e historial a un archivo CSV compatible con Excel
 */
export function exportAppointmentsToCSV(appointments = []) {
  if (!appointments.length) return

  const headers = [
    'Código Reserva',
    'Cliente',
    'Correo Electrónico',
    'Teléfono (+1)',
    'Vía de Respuesta',
    'Comprobante 50%',
    'Tipo de Sesión',
    'Personas',
    'Fecha',
    'Hora Cita',
    'Minutos Gracia',
    'Hora Límite Llegada',
    'Estado',
    'Precio Estimado',
    'Notas Historial Admin',
    'Creada En',
  ]

  const rows = appointments.map((a) => {
    const { limit12 } = calculateGraceLimit(a.appointment_time, a.grace_minutes)
    const { email, phone, hasPaymentProof, channelLabel } = extractContactInfo(a)
    return [
      a.booking_code || '',
      `"${(a.client_name || '').replace(/"/g, '""')}"`,
      `"${(email || 'No indicado').replace(/"/g, '""')}"`,
      `"${(phone || 'No indicado').replace(/"/g, '""')}"`,
      `"${channelLabel}"`,
      hasPaymentProof ? 'Anexado' : 'Sin comprobante',
      `"${(a.service_name || '').replace(/"/g, '""')}"`,
      a.people_count || 1,
      a.appointment_date || '',
      formatTime12h(a.appointment_time),
      `${a.grace_minutes || 25} min`,
      limit12,
      a.status || 'pendiente',
      a.estimated_price ? a.estimated_price : 'Por definir',
      `"${(a.admin_notes || '').replace(/"/g, '""')}"`,
      a.created_at ? new Date(a.created_at).toLocaleString('es-DO') : '',
    ].join(',')
  })

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `isostudio-historial-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Abre una ventana de impresión/guardado PDF con el comprobante del cliente incluyendo la captura de su pago 50%
 */
export function printBookingTicket(appointment) {
  const { limit12 } = calculateGraceLimit(appointment.appointment_time, appointment.grace_minutes)
  const { email, phone, paymentProof, referenceNote, channelLabel } = extractContactInfo(appointment)
  const win = window.open('', '_blank', 'width=540,height=820')
  if (!win) return

  win.document.write(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Comprobante ${appointment.booking_code} — ISO Studio</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0a0a0a;
          color: #f7f5f4;
          padding: 26px 20px;
          margin: 0;
        }
        .card {
          border: 1px solid rgba(215, 149, 183, 0.45);
          border-radius: 16px;
          padding: 24px;
          background: #161014;
        }
        .brand {
          font-family: Georgia, serif;
          font-size: 22px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin: 0 0 4px;
        }
        .sub {
          color: #c9a3b1;
          font-size: 12px;
          margin-bottom: 16px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          padding: 7px 0;
          border-bottom: 1px solid rgba(247, 245, 244, 0.08);
          font-size: 13px;
        }
        .label { color: #c9a3b1; }
        .val { font-weight: 600; color: #f7f5f4; text-align: right; }
        .box {
          margin-top: 14px;
          padding: 12px;
          border-radius: 10px;
          background: rgba(215, 149, 183, 0.10);
          border: 1px solid rgba(215, 149, 183, 0.32);
          font-size: 12px;
          line-height: 1.5;
        }
        .voucher-wrap {
          margin-top: 14px;
          text-align: center;
          padding: 12px;
          border-radius: 10px;
          background: #0a0a0a;
          border: 1px solid rgba(247, 245, 244, 0.12);
        }
        .voucher-wrap img {
          max-width: 240px;
          max-height: 260px;
          border-radius: 8px;
          object-fit: contain;
          margin-top: 8px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1 class="brand">ISO STUDIO</h1>
        <div class="sub">Comprobante de Reserva y Abono del 50% • San Cristóbal, RD</div>
        <div class="row"><span class="label">Código de Reserva:</span><span class="val">${appointment.booking_code}</span></div>
        <div class="row"><span class="label">Estado actual:</span><span class="val">${appointment.status === 'confirmada' ? 'ACEPTADA (Pago Verificado)' : 'Pendiente validación de transferencia'}</span></div>
        <div class="row"><span class="label">Cliente:</span><span class="val">${appointment.client_name}</span></div>
        <div class="row"><span class="label">Correo electrónico:</span><span class="val">${email || 'No indicado'}</span></div>
        <div class="row"><span class="label">Teléfono (+1):</span><span class="val">${phone || 'No indicado'}</span></div>
        <div class="row"><span class="label">Vía de confirmación:</span><span class="val">${channelLabel}</span></div>
        <div class="row"><span class="label">Tipo de sesión:</span><span class="val">${appointment.service_name}</span></div>
        <div class="row"><span class="label">Personas:</span><span class="val">${appointment.people_count}</span></div>
        <div class="row"><span class="label">Fecha y Hora:</span><span class="val">${formatDateSpanish(appointment.appointment_date)} • ${formatTime12h(appointment.appointment_time)}</span></div>
        <div class="row"><span class="label">Tarifa / Abono 50%:</span><span class="val">${formatPriceSlot(appointment.estimated_price)} (${formatDeposit50(appointment.estimated_price)})</span></div>
        ${referenceNote ? `<div class="row"><span class="label">Referencia / Banco:</span><span class="val">${referenceNote}</span></div>` : ''}

        ${
          paymentProof
            ? `<div class="voucher-wrap">
                <div style="font-size:11px;color:#E3B8D0;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">
                  Comprobante de Transferencia 50% Anexado
                </div>
                <img src="${paymentProof}" alt="Comprobante de pago" />
              </div>`
            : ''
        }

        <div class="box">
          <strong>Política de Puntualidad:</strong> Cuentas con <strong>${appointment.grace_minutes || 25} minutos de gracia</strong>
          (hasta las <strong>${limit12}</strong>) para llegar al estudio sin perder tu reserva.
        </div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `)
  win.document.close()
}
