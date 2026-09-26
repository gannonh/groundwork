import * as NodeFs from 'node:fs'
import * as NodePath from 'node:path'
import { parseArgs } from 'node:util'

const OUT_DIR = NodePath.join(import.meta.dirname, '..', 'fixtures', 'exports')
const ACCOUNTS = 60

type Rng = () => number
function mulberry32(seed: number): Rng {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: Rng, items: readonly T[]): T => {
  const item = items[Math.floor(r() * items.length)]
  if (item === undefined) throw new Error('pick from an empty list')
  return item
}
function shuffle<T>(r: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}
const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const accountId = (n: number) => `ACC-${pad(n, 3)}`

function csv(rows: readonly (readonly string[])[], eol = '\n'): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  return rows.map((row) => row.map(cell).join(',')).join(eol) + eol
}

type Theme = { readonly subjects: readonly string[]; readonly sentences: readonly string[] }
const THEMES: readonly Theme[] = [
  {
    subjects: ['Dashboard totals are wrong', "Numbers don't match Salesforce", 'Revenue chart off by a few percent'],
    sentences: [
      'The revenue total on our {dashboard} dashboard is about {pct}% lower than what Salesforce shows for the same period.',
      'Our finance team caught the mismatch during the monthly close, and now they do not trust any of the numbers.',
      'I have to screenshot the source system next to yours in every exec review to prove the figure is right.',
      'We filtered both systems to the same date range, and the totals still differ.',
      'Is there a way to see which rows make up a total, so we can reconcile it ourselves?',
    ],
  },
  {
    subjects: ['CSV import failed', 'Import stuck at 0%', 'Upload rejected with no reason'],
    sentences: [
      'I uploaded a CSV with {rows} rows and only part of it came through, with no error message.',
      'The importer says "Upload complete", but half of the rows are missing from the table.',
      'We had to split the file into smaller chunks by hand, which took most of the afternoon.',
      'If a row is malformed, please tell us which one, instead of silently dropping it.',
      'This blocks our weekly reporting, because the numbers are incomplete until someone notices.',
    ],
  },
  {
    subjects: ['Field mapping lost', 'Have to remap columns every time', 'Mapping not saved'],
    sentences: [
      'Every time we import the weekly export, we have to map all {cols} columns again.',
      'The mapping from last week is gone, even though the file has exactly the same headers.',
      'Our ops lead spends about {mins} minutes per upload just clicking through the mapping screen.',
      'Could the app remember the mapping for a file with the same columns?',
    ],
  },
  {
    subjects: ['When was this data refreshed?', 'Stale data on the home dashboard', 'Sync status unclear'],
    sentences: [
      "I can't tell when the {dashboard} dashboard last refreshed, so I don't know if it includes today's orders.",
      'Yesterday the numbers looked stale for a few hours, and nobody knew whether the sync was still running.',
      'A simple "last updated" timestamp on each chart would save us a lot of back and forth.',
      'Our execs asked twice this week whether the data was current.',
    ],
  },
  {
    subjects: ['Need team-level permissions', 'Restrict dashboards by team', 'Access control request'],
    sentences: [
      'We need to restrict the {dashboard} dashboard to the finance team only.',
      'Right now anyone in the workspace can see salary data, which our security review flagged.',
      'Our procurement team said this is a deal breaker for the renewal.',
      'Can admins create groups and share a folder with a group instead of with each person?',
    ],
  },
  {
    subjects: ['Charts break in slides', 'Export to PowerPoint loses formatting', 'PNG export is blurry'],
    sentences: [
      'When I export a chart to slides, the colors reset and the axis labels overlap.',
      'I rebuild the same {n} charts in PowerPoint every month for the board deck.',
      'The PNG export is blurry on a projector, so we take screenshots instead.',
      'An SVG or high-resolution export would fix most of this.',
    ],
  },
  {
    subjects: ['Invoice higher than expected', 'Usage bill question', 'Unexpected overage charge'],
    sentences: [
      'Our invoice this month was {pct}% higher than last month, and nobody on our side changed anything.',
      'I cannot find a usage breakdown that explains the overage.',
      'Finance wants a way to set a spending cap before the renewal conversation.',
      'Please send a breakdown of the query volume by team.',
    ],
  },
  {
    subjects: ['SSO setup', 'Okta integration help', 'Enable SAML for our workspace'],
    sentences: [
      'We want to enable SSO with Okta, but the settings page says to contact support.',
      'Our IT team expected to configure SAML themselves, the same way they do for other tools.',
      'Rolling out to {seats} new seats is on hold until SSO works.',
      'Is there documentation for the SAML attributes you expect?',
    ],
  },
]
const OPENERS = ['Hi team,', 'Hello,', 'Hi there.', 'Quick question.', 'Following up on last week.', '']
const CLOSERS = ['Thanks!', 'Thanks in advance.', 'Any update would help.', 'Please advise.', '']
const DASHBOARDS = ['Revenue', 'Pipeline', 'Weekly KPIs', 'Churn', 'Executive Summary', 'Marketing Funnel']
const ROLES = ['End user', 'End user', 'End user', 'Admin', 'Admin', 'Buyer', 'Executive']
const CONTACTS = [
  'You can reach our admin at ops@brightline.io if you need access.',
  'Call me at (212) 555-0147 if a screen share is easier.',
  'We tried paying the overage with card 4111 1111 1111 1111, and it was declined.',
  'Loop in our billing contact, billing@northwind-analytics.com, on the reply.',
]

function fill(r: Rng, sentence: string): string {
  return sentence
    .replace('{dashboard}', pick(r, DASHBOARDS))
    .replace('{pct}', String(3 + Math.floor(r() * 18)))
    .replace('{rows}', String(1000 + Math.floor(r() * 90) * 100))
    .replace('{cols}', String(8 + Math.floor(r() * 30)))
    .replace('{mins}', String(10 + Math.floor(r() * 50)))
    .replace('{n}', String(4 + Math.floor(r() * 12)))
    .replace('{seats}', String(20 + Math.floor(r() * 400)))
}

function description(r: Rng, theme: Theme, i: number): string {
  const body = shuffle(r, theme.sentences)
    .slice(0, 2 + Math.floor(r() * 3))
    .map((s) => fill(r, s))
  if (i % 41 === 7) body.push(pick(r, CONTACTS))
  const text = [pick(r, OPENERS), ...body, pick(r, CLOSERS)].filter((s) => s !== '').join(' ')
  if (i % 9 !== 4) return text
  return `${text}\n\nSteps to reproduce:\n1. Open the ${pick(r, DASHBOARDS)} dashboard.\n2. Set the range to "Last 30 days".\n3. Compare the total with the source system.`
}

const DAY_MS = 86_400_000
const START = Date.UTC(2026, 5, 1)
const SPAN_DAYS = 112

function zendesk(rows: number): string {
  const r = mulberry32(3465)
  const out: string[][] = [['Ticket ID', 'Created at', 'Subject', 'Description', 'Requester role', 'Organization ID']]
  for (let i = 0; i < rows; i++) {
    const at = new Date(START + Math.floor(r() * SPAN_DAYS * DAY_MS))
    const created = `${String(at.getUTCFullYear())}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`
    const theme = pick(r, THEMES)
    const org = r() < 0.1 ? '' : accountId(1 + Math.floor(r() * ACCOUNTS))
    const subject = pick(r, theme.subjects)
    const row =
      i === 0
        ? [
            'Dashboard totals are wrong',
            'Hi, I\'m Jane from Acme. Please email me at jane@acme.com or call +1 (415) 555-0100 about the "Revenue" dashboard. Our totals are 8% lower than Salesforce, and my CFO noticed.',
          ]
        : [subject, description(r, theme, i)]
    out.push([String(1001 + i), created, ...row, pick(r, ROLES), org])
  }
  return csv(out)
}

const NPS_COMMENTS = [
  'Love the dashboards, but the numbers do not always match our CRM.',
  'Setup took a week because SSO needed a support ticket.',
  'Great product. Exports to slides still need work.',
  "The bill is hard to predict, which makes renewals tense.",
  'Imports fail without telling us which row is broken.',
  'Mapping columns on every upload is tedious.',
  'Solid tool, and support answers fast.',
  "We can't restrict dashboards by team, which is a blocker for finance.",
  'I never know when the data was last refreshed.',
  'Easy to use, and the charts look great.',
]

function nps(rows: number): string {
  const r = mulberry32(300)
  const out: string[][] = [['Response ID', 'Submitted', 'Score', 'Comment', 'Account']]
  for (let i = 0; i < rows; i++) {
    const at = new Date(START + Math.floor(r() * SPAN_DAYS) * DAY_MS)
    const submitted = `${pad(at.getUTCDate())}/${pad(at.getUTCMonth() + 1)}/${String(at.getUTCFullYear())}`
    const score = Math.floor(r() * 11)
    const comment = `${pick(r, NPS_COMMENTS)}${r() < 0.3 ? ` Score reason: ${score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor'}.` : ''}`
    out.push([`R-${pad(i + 1, 4)}`, submitted, String(score), comment, accountId(1 + Math.floor(r() * ACCOUNTS))])
  }
  return csv(out)
}

const NAME_A = ['Acme', 'Brightline', 'Cobalt', 'Driftwood', 'Evergreen', 'Fathom', 'Granite', 'Halcyon', 'Ironclad', 'Juniper']
const NAME_B = ['Analytics', 'Health', 'Logistics', 'Retail', 'Bank', 'Labs']

function accounts(): string {
  const r = mulberry32(60)
  const out: string[][] = [['Account ID', 'Name', 'ARR', 'Plan', 'Segment']]
  for (let i = 0; i < ACCOUNTS; i++) {
    const segment = pick(r, ['SMB', 'Mid-market', 'Enterprise'] as const)
    const plan = segment === 'Enterprise' ? 'Enterprise' : segment === 'SMB' ? pick(r, ['Starter', 'Growth']) : pick(r, ['Growth', 'Enterprise'])
    const base = segment === 'Enterprise' ? 150_000 : segment === 'Mid-market' ? 45_000 : 6_000
    const arr = Math.round((base * (1 + r() * 2)) / 500) * 500
    const written = i % 2 === 0 ? String(arr) : `$${arr.toLocaleString('en-US')}`
    const name = `${NAME_A[i % NAME_A.length] ?? ''} ${NAME_B[Math.floor(i / NAME_A.length)] ?? ''}`
    out.push([accountId(i + 1), name, written, plan, segment])
  }
  return csv(out, '\r\n')
}

const { values } = parseArgs({ options: { rows: { type: 'string' }, out: { type: 'string' } } })
if (values.rows !== undefined || values.out !== undefined) {
  const rows = Number(values.rows)
  if (!Number.isInteger(rows) || rows < 1 || !values.out) throw new Error('usage: --rows <N> --out <path>')
  NodeFs.writeFileSync(values.out, zendesk(rows))
  console.log(`Wrote ${String(rows)} rows to ${values.out}`)
} else {
  NodeFs.mkdirSync(OUT_DIR, { recursive: true })
  const files = { 'zendesk-500.csv': zendesk(500), 'nps-300.csv': nps(300), 'accounts-60.csv': accounts() }
  for (const [name, content] of Object.entries(files)) {
    NodeFs.writeFileSync(NodePath.join(OUT_DIR, name), content)
    console.log(`Wrote fixtures/exports/${name}`)
  }
}
