import './style.css'
import { renderBookingView } from './views/bookingView'
import { renderAdminView } from './views/adminView'

const viewContainer = document.getElementById('view-container')
const adminOnlyNav = document.getElementById('admin-only-nav')
const headerSubtitle = document.getElementById('header-subtitle')

let currentCleanup = null

function router() {
  const hash = window.location.hash

  if (!hash || (hash !== '#reservar' && hash !== '#admin')) {
    window.location.hash = '#reservar'
    return
  }

  if (typeof currentCleanup === 'function') {
    currentCleanup()
    currentCleanup = null
  }

  if (hash === '#admin') {
    document.title = 'ISO Studio | Dashboard Administradora'
    adminOnlyNav?.classList.remove('hidden')
    adminOnlyNav?.classList.add('flex')
    if (headerSubtitle) headerSubtitle.textContent = 'Panel de Administración • Esther'
    currentCleanup = renderAdminView(viewContainer)
  } else {
    document.title = 'ISO Studio | Reservar Sesión'
    adminOnlyNav?.classList.add('hidden')
    adminOnlyNav?.classList.remove('flex')
    if (headerSubtitle) headerSubtitle.textContent = 'Estudio Fotográfico • San Cristóbal, RD'
    currentCleanup = renderBookingView(viewContainer)
  }
}

window.addEventListener('hashchange', router)
window.addEventListener('DOMContentLoaded', router)

router()
