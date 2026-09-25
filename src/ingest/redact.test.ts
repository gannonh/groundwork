import { describe, expect, test } from 'vitest'
import { redact } from './redact.ts'

describe('redact', () => {
  test.each([
    ['Email me at jane@acme.com.', 'Email me at [email].'],
    ['jane.doe+ops@mail.acme.co.uk, bob@x.io', '[email], [email]'],
    ['See https://example.com/?u=jane@acme.com for details.', 'See https://example.com/?u=[email] for details.'],
    ['Call +1 (415) 555-0100 today.', 'Call [phone] today.'],
    ['Reach me on 415.555.0100 or (415) 555-0199.', 'Reach me on [phone] or [phone].'],
    ['London office: +44 20 7946 0958.', 'London office: [phone].'],
    ['Text +14155550100 anytime.', 'Text [phone] anytime.'],
    ['Card 4111 1111 1111 1111 was declined.', 'Card [card] was declined.'],
    ['Paid with 4111-1111-1111-1111, then Amex 3782 822463 10005.', 'Paid with [card], then Amex [card].'],
    ['Released on 2026-01-05 at 09:32, broke in v2.3.1.', 'Released on 2026-01-05 at 09:32, broke in v2.3.1.'],
    [
      'Order #48213, invoice 1234 5678, ref 1234 5678 9012 3456.',
      'Order #48213, invoice 1234 5678, ref 1234 5678 9012 3456.',
    ],
    ['Server 192.168.100.200 went down at 2026-08-14 09:32:10.', 'Server 192.168.100.200 went down at 2026-08-14 09:32:10.'],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected)
  })
})
