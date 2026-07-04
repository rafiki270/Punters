import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import { configSigningKey, publicJwk } from '../../core/keys'

/**
 * The two endpoints UOA itself fetches: the signed config JWT (re-signed per request,
 * per the integration guide — "do NOT cache JWTs long") and its JWKS. Everything in
 * `payload` here is public-facing UI config; secrets are never allowed in this JWT
 * (UOA scans for and rejects `client_secret`/`client_hash`/etc. in the payload).
 */
export async function uoaConfigRoutes(app: FastifyInstance) {
  app.get('/uoa/config', async (_req, reply) => {
    const { key, kid } = await configSigningKey()
    const domain = process.env.UOA_DOMAIN!
    const relayUrl = process.env.RELAY_PUBLIC_URL!

    const payload = {
      domain,
      jwks_url: `https://${domain}/uoa/jwks.json`,
      contact_email: process.env.UOA_CONTACT_EMAIL!,
      redirect_urls: [`${relayUrl}/auth/callback`],
      enabled_auth_methods: ['email_password', 'google'],
      ui_theme: {
        colors: {
          bg: '#0e1319',
          surface: '#151c25',
          text: '#e7edf4',
          muted: '#8b9bad',
          primary: '#f5a524',
          primary_text: '#241703',
          border: '#26313f',
          danger: '#ef5f5f',
          danger_text: '#ffffff',
        },
        radii: { card: '10px', button: '6px', input: '6px' },
        density: 'comfortable',
        typography: { font_family: 'sans', base_text_size: 'md' },
        button: { style: 'solid' },
        card: { style: 'bordered' },
        logo: { url: '', alt: 'Punters', text: 'Punters', font_size: '24px', color: '#e7edf4' },
        css_vars: {},
      },
      language_config: 'en',
      org_features: {
        enabled: true,
        auto_create_personal_org_on_first_login: false,
        pending_invites_block_auto_create: true,
        org_roles: ['owner', 'admin', 'member'],
      },
    }

    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuedAt()
      .sign(key)

    reply.header('content-type', 'application/jwt')
    return jwt
  })

  app.get('/uoa/jwks.json', async () => {
    const { key, kid } = await configSigningKey()
    return { keys: [await publicJwk(key, kid)] }
  })
}
