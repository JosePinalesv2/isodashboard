/**
 * Alerta sonora suave (Web Audio API) cuando entra una nueva reserva al Dashboard de la Administradora
 */
export function playNewBookingSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Acorde suave de campana de estudio (La4 -> Mi5)
    const freqs = [440, 659.25]
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.12)

      gain.gain.setValueAtTime(0.0001, now + idx * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.12 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.55)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + idx * 0.12)
      osc.stop(now + idx * 0.12 + 0.6)
    })
  } catch {
    // Ignorar si el navegador bloquea autoplay de audio antes de la primera interacción
  }
}
