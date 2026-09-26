import type { RawText, RedactedText } from '../domain/types.ts'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// 4-4-4-1..7 covers 13 to 19 digits; 4-6-4..5 covers Amex. Luhn separates cards from order numbers of the same shape.
const CARD = /\b(?:(?:\d{4}[ -]?){3}\d{1,7}|\d{4}[ -]?\d{6}[ -]?\d{4,5})\b/g
// Digit groups need a separator, so a bare run of digits (an order number) is not a phone number unless it starts with +.
const PHONE =
  /(?<![\w+])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]\d{2,4}){1,4}(?![\w:])|(?<![\w+])\+\d{10,15}\b/g
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/

/** Replaces emails, card numbers, and phone numbers with [email], [card], and [phone]. */
export function redact(text: RawText | string): RedactedText {
  return text
    .replace(EMAIL, '[email]')
    .replace(CARD, (match) => (luhn(digitsOf(match)) ? '[card]' : match))
    .replace(PHONE, (match) => {
      const count = digitsOf(match).length
      return count >= 10 && count <= 15 && !IPV4.test(match) ? '[phone]' : match
    }) as RedactedText
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits.charAt(digits.length - 1 - i))
    const doubled = i % 2 === 1 ? d * 2 : d
    sum += doubled > 9 ? doubled - 9 : doubled
  }
  return sum % 10 === 0
}
