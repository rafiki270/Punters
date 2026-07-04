import { generateKeyPair, exportPKCS8 } from 'jose'

/** One-time setup helper: prints two PKCS8 private key PEMs for .env. Public keys are
 * derived from these at runtime (see core/keys.ts) — nothing else needs to be stored. */
async function main() {
  for (const [envVar, label] of [
    ['CONFIG_SIGNING_PRIVATE_KEY_PEM', 'config-signing'],
    ['SESSION_SIGNING_PRIVATE_KEY_PEM', 'session-signing'],
  ] as const) {
    const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
    const pem = await exportPKCS8(privateKey)
    console.log(`# ${label}`)
    console.log(`${envVar}="${pem.trim().replace(/\n/g, '\\n')}"`)
    console.log()
  }
}

main()
