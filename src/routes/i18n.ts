import { FastifyInstance } from 'fastify'

// Minimal stub: serves the built-in English bundle, extend to load from files later.
export async function registerI18nRoutes(app: FastifyInstance) {
  app.get('/api/i18n/:locale', async (req) => {
    const { locale } = req.params as any
    const lng = typeof locale === 'string' && locale ? locale : 'en'
    // In a next step, look up from disk or DB
    return {
      lng,
      resources: {
        translation: {
          Admin: 'Admin',
          Display: 'Display'
        }
      }
    }
  })
}

