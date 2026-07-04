/**
 * Format an amount stored in minor units (pence, cents) for display.
 * Whole amounts drop the decimals ("£6" rather than "£6.00") to keep boards clean.
 * Assumes 2-decimal currencies, which covers GBP/EUR/USD and friends.
 */
export function formatMoney(amountMinor: number, currency: string, locale = 'en-GB'): string {
  const whole = amountMinor % 100 === 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amountMinor / 100)
}

/** Parse a user-entered price string ("6", "6.5", "£6.50") into minor units, or null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(',', '.')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}
