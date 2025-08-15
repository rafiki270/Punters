import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Basic in-bundle English fallback; runtime loading can fetch from /api/i18n/:locale later
const resources = {
  en: {
    translation: {
      Admin: 'Admin',
      Display: 'Display'
    }
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export default i18n

