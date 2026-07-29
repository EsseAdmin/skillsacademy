/** Formats a price held in pence as a sterling amount, e.g. 4900 → "£49.00". */
export function formatGBP(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}
