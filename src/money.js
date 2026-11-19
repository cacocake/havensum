export const k_centsPerEuro = 100;
const k_currency = 'EUR';
const k_moneyLocale = 'en-IE';
const k_defaultDecimalPlaces = 2;
const k_decimalMoneyPattern = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

export function euro(amountInCents, decimalPlaces = k_defaultDecimalPlaces) {
  return new Intl.NumberFormat(k_moneyLocale, {
    style: 'currency',
    currency: k_currency,
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(amountInCents / k_centsPerEuro);
}

export function sumCents(amountsInCents) {
  return amountsInCents.reduce((total, amount) => total + amount, 0);
}

// Savings are shown with an explicit sign, using a true minus sign.
export function signedEuro(amountInCents) {
  return `${amountInCents >= 0 ? '+' : '−'}${euro(Math.abs(amountInCents))}`;
}

export function cents(amountInEuros) {
  const normalizedAmount = String(amountInEuros).trim().replace(',', '.');
  const decimalParts = k_decimalMoneyPattern.exec(normalizedAmount);
  if (!decimalParts) {
    // Preserve the existing rounding contract for inputs with sub-cent precision.
    return Math.round(Number(normalizedAmount) * k_centsPerEuro);
  }

  const [, sign, wholeEuros, fractionalEuros = ''] = decimalParts;
  const wholeCents = Number(wholeEuros) * k_centsPerEuro;
  const fractionalCents = Number(fractionalEuros.padEnd(k_defaultDecimalPlaces, '0'));
  const amountInCents = wholeCents + fractionalCents;
  return sign === '-' ? -amountInCents : amountInCents;
}

export function isPositiveCentAmount(amountInCents) {
  return Number.isSafeInteger(amountInCents) && amountInCents > 0;
}
