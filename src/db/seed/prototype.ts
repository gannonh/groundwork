// Prototype D's mock data (prototypes/opportunity-map/index.html), transcribed. The seed reproduces its accounts,
// ARR, mentions, pain, and needs-review counts exactly, and uses each TREND only as the shape of the weekly series.
import type { PainLevel, SpeakerRole } from '../../domain/types.ts'

export type SourceKey = 'zd' | 'gong' | 'nps' | 'int' | 'g2'
export type ProtoQuote = {
  /** Quote text; `<mark>` wraps the part the prototype highlights. */
  readonly text: string
  readonly account: string
  readonly arr: number
  readonly role: SpeakerRole
  readonly source: SourceKey
  /** UTC date the item occurred, 'YYYY-MM-DD'. */
  readonly date: string
  /** The prototype's low-confidence flag ("62% confident"). */
  readonly low?: true
}
export type ProtoProblem = {
  readonly key: string
  readonly outcome: (typeof OUTCOMES)[number]['key']
  readonly title: string
  readonly accounts: number
  readonly arr: number
  readonly mentions: number
  readonly pain: PainLevel
  readonly low: number
  readonly link: string | null
  readonly solutions: readonly (readonly [title: string, mentions: number])[]
  readonly quotes: readonly ProtoQuote[]
  /** The prototype's 12-week series, oldest first. */
  readonly trend: readonly number[]
}

export const OUTCOMES = [
  { key: 'o1', title: 'Get customer data in without engineering help' },
  { key: 'o2', title: 'Trust the numbers in reports' },
  { key: 'o3', title: 'Share findings with stakeholders' },
  { key: 'o4', title: 'Control access and spend' },
] as const

export const SOURCES = {
  zd: { name: 'Zendesk', itemKind: 'ticket' },
  gong: { name: 'Gong', itemKind: 'call' },
  nps: { name: 'NPS', itemKind: 'survey_response' },
  int: { name: 'Interviews', itemKind: 'interview' },
  g2: { name: 'G2', itemKind: 'review' },
} as const satisfies Record<SourceKey, { name: string; itemKind: string }>

export const PROBLEMS: readonly ProtoProblem[] = [
  {
    key: 'p1',
    outcome: 'o1',
    title: 'CSV imports fail silently on malformed rows',
    accounts: 38,
    arr: 1_420_000,
    mentions: 112,
    pain: 3,
    low: 6,
    link: null,
    solutions: [
      ['Row-level error report after import', 41],
      ['Dry-run / validate before import', 23],
    ],
    quotes: [
      {
        text: 'We uploaded 40k rows and <mark>only 31k showed up. No error, nothing.</mark> We found out a week later from finance.',
        account: 'Juniper Freight',
        arr: 184_000,
        role: 'admin',
        source: 'zd',
        date: '2026-09-12',
      },
      {
        text: 'Honestly the <mark>import is a black box</mark>. I just re-upload until the count looks right.',
        account: 'Parcelly',
        arr: 62_000,
        role: 'end_user',
        source: 'int',
        date: '2026-08-29',
      },
      {
        text: 'If a row is bad just tell me which one. <mark>I spent two days bisecting a CSV.</mark>',
        account: 'Kestrel Labs',
        arr: 96_000,
        role: 'admin',
        source: 'gong',
        date: '2026-09-03',
        low: true,
      },
    ],
    trend: [9, 13, 11, 10, 14, 17, 14, 14, 19, 20, 17, 19],
  },
  {
    key: 'p2',
    outcome: 'o1',
    title: 'Field mapping must be redone for every import',
    accounts: 27,
    arr: 980_000,
    mentions: 64,
    pain: 2,
    low: 2,
    link: null,
    solutions: [
      ['Saved mapping templates', 38],
      ['Auto-detect columns from headers', 12],
    ],
    quotes: [
      {
        text: 'Every Monday I <mark>map the same 22 columns by hand</mark>. Please remember them.',
        account: 'Tandem Retail',
        arr: 71_000,
        role: 'end_user',
        source: 'nps',
        date: '2026-09-15',
      },
      {
        text: 'The mapping step is where my team <mark>loses 30 minutes a week</mark>.',
        account: 'Meridian Ops',
        arr: 118_000,
        role: 'admin',
        source: 'gong',
        date: '2026-08-21',
      },
    ],
    trend: [10, 6, 9, 12, 8, 7, 10, 12, 8, 8, 12, 11],
  },
  {
    key: 'p3',
    outcome: 'o1',
    title: 'No way to backfill historical data',
    accounts: 12,
    arr: 610_000,
    mentions: 29,
    pain: 2,
    low: 1,
    link: null,
    solutions: [['Bulk historical import job', 17]],
    quotes: [
      {
        text: 'We can only see data since we signed up, so <mark>year-over-year is impossible</mark>.',
        account: 'Halcyon Bank',
        arr: 240_000,
        role: 'buyer',
        source: 'gong',
        date: '2026-09-09',
      },
      {
        text: 'Our board wants 3 years of trend. <mark>We still build that in Excel.</mark>',
        account: 'Fernway',
        arr: 88_000,
        role: 'executive',
        source: 'int',
        date: '2026-08-30',
      },
    ],
    trend: [10, 15, 13, 10, 14, 17, 14, 14, 19, 19, 16, 18],
  },
  {
    key: 'p4',
    outcome: 'o2',
    title: "Dashboard totals don't match the source system",
    accounts: 44,
    arr: 2_310_000,
    mentions: 141,
    pain: 3,
    low: 9,
    link: null,
    solutions: [
      ['Reconciliation view vs. source', 36],
      ['Show calculation lineage per metric', 29],
      ['Export raw rows behind a number', 14],
    ],
    quotes: [
      {
        text: 'Our CFO saw <mark>revenue off by 4% versus Stripe</mark> and now nobody trusts the dashboard.',
        account: 'Halcyon Bank',
        arr: 240_000,
        role: 'executive',
        source: 'gong',
        date: '2026-09-18',
      },
      {
        text: "I have to <mark>screenshot the source system next to yours</mark> in every exec review to prove it's right.",
        account: 'Orbitly',
        arr: 132_000,
        role: 'end_user',
        source: 'int',
        date: '2026-09-06',
      },
      {
        text: "Numbers don't tie out. <mark>This is a renewal risk for us.</mark>",
        account: 'Cobalt Insurance',
        arr: 310_000,
        role: 'buyer',
        source: 'zd',
        date: '2026-09-11',
      },
      {
        text: 'Totals are different depending on which page you look at?',
        account: 'Lumen Clinics',
        arr: 74_000,
        role: 'end_user',
        source: 'g2',
        date: '2026-08-25',
        low: true,
      },
    ],
    trend: [8, 6, 10, 14, 12, 12, 17, 20, 17, 18, 24, 24],
  },
  {
    key: 'p5',
    outcome: 'o2',
    title: "Can't tell when data was last refreshed",
    accounts: 31,
    arr: 1_050_000,
    mentions: 77,
    pain: 1,
    low: 3,
    link: 'LIN-417',
    solutions: [['"Last synced" timestamp on every chart', 44]],
    quotes: [
      {
        text: "Is this <mark>live or from yesterday</mark>? I genuinely can't tell.",
        account: 'Quillstack',
        arr: 54_000,
        role: 'end_user',
        source: 'nps',
        date: '2026-09-14',
      },
      {
        text: 'We made a pricing call on <mark>stale data</mark> because the sync had failed overnight.',
        account: 'Tandem Retail',
        arr: 71_000,
        role: 'executive',
        source: 'gong',
        date: '2026-08-27',
      },
    ],
    trend: [6, 10, 8, 5, 8, 10, 6, 5, 9, 9, 5, 6],
  },
  {
    key: 'p6',
    outcome: 'o2',
    title: 'Timezone handling shifts daily counts',
    accounts: 9,
    arr: 420_000,
    mentions: 18,
    pain: 1,
    low: 2,
    link: null,
    solutions: [['Workspace timezone setting', 11]],
    quotes: [
      {
        text: 'Daily signups are <mark>off by one day for our APAC team</mark>.',
        account: 'Arcadia Games',
        arr: 66_000,
        role: 'end_user',
        source: 'zd',
        date: '2026-08-18',
      },
    ],
    trend: [8, 4, 5, 8, 4, 1, 4, 4, 1, 1, 3, 2],
  },
  {
    key: 'p7',
    outcome: 'o3',
    title: 'Exported charts lose formatting in slides',
    accounts: 22,
    arr: 540_000,
    mentions: 58,
    pain: 1,
    low: 4,
    link: null,
    solutions: [
      ['Export to Google Slides', 19],
      ['SVG export', 9],
    ],
    quotes: [
      {
        text: 'Every export <mark>comes out blurry</mark> and I rebuild the chart in Keynote.',
        account: 'Fernway',
        arr: 88_000,
        role: 'end_user',
        source: 'g2',
        date: '2026-08-12',
      },
      {
        text: 'The legend <mark>disappears when I paste into PowerPoint</mark>.',
        account: 'Brightline Health',
        arr: 43_000,
        role: 'end_user',
        source: 'zd',
        date: '2026-08-20',
        low: true,
      },
    ],
    trend: [7, 10, 8, 3, 5, 7, 3, 1, 3, 3, 1, 1],
  },
  {
    key: 'p8',
    outcome: 'o3',
    title: 'Viewers need a paid seat to see a dashboard',
    accounts: 35,
    arr: 1_880_000,
    mentions: 96,
    pain: 2,
    low: 5,
    link: 'LIN-482',
    solutions: [
      ['Free view-only seats', 52],
      ['Public share links', 21],
    ],
    quotes: [
      {
        text: "I can't justify <mark>a $40 seat for a VP who looks once a month</mark>.",
        account: 'Cobalt Insurance',
        arr: 310_000,
        role: 'buyer',
        source: 'gong',
        date: '2026-09-16',
      },
      {
        text: 'We ended up <mark>sharing one login across the sales team</mark>. Not great.',
        account: 'Northwind',
        arr: 150_000,
        role: 'admin',
        source: 'int',
        date: '2026-09-02',
      },
      {
        text: "Seat pricing is the <mark>main reason we're evaluating alternatives</mark>.",
        account: 'Orbitly',
        arr: 132_000,
        role: 'buyer',
        source: 'gong',
        date: '2026-09-19',
      },
    ],
    trend: [12, 10, 12, 17, 16, 14, 19, 22, 19, 19, 25, 26],
  },
  {
    key: 'p9',
    outcome: 'o3',
    title: 'No scheduled email digest',
    accounts: 17,
    arr: 390_000,
    mentions: 41,
    pain: 0,
    low: 3,
    link: null,
    solutions: [['Weekly email digest', 31]],
    quotes: [
      {
        text: "I'd love a <mark>Monday email with the 5 numbers I care about</mark>.",
        account: 'Parcelly',
        arr: 62_000,
        role: 'executive',
        source: 'nps',
        date: '2026-09-08',
      },
    ],
    trend: [5, 9, 7, 4, 6, 10, 6, 4, 8, 9, 5, 5],
  },
  {
    key: 'p10',
    outcome: 'o4',
    title: "Admins can't restrict access by team",
    accounts: 19,
    arr: 1_640_000,
    mentions: 47,
    pain: 3,
    low: 2,
    link: null,
    solutions: [
      ['Team-scoped permissions', 27],
      ['Row-level security', 13],
    ],
    quotes: [
      {
        text: "Security review flagged that <mark>every user can see every region's data</mark>. That blocks our rollout.",
        account: 'Halcyon Bank',
        arr: 240_000,
        role: 'admin',
        source: 'gong',
        date: '2026-09-17',
      },
      {
        text: 'We need <mark>HR dashboards visible to HR only</mark>, full stop.',
        account: 'Lumen Clinics',
        arr: 74_000,
        role: 'admin',
        source: 'zd',
        date: '2026-09-04',
      },
    ],
    trend: [9, 6, 8, 13, 12, 9, 14, 17, 14, 13, 18, 20],
  },
  {
    key: 'p11',
    outcome: 'o4',
    title: 'Usage-based bill is unpredictable',
    accounts: 26,
    arr: 1_120_000,
    mentions: 69,
    pain: 2,
    low: 7,
    link: null,
    solutions: [
      ['Spend alerts and caps', 34],
      ['Usage forecast on billing page', 15],
    ],
    quotes: [
      {
        text: 'Our <mark>bill doubled in March</mark> and we had no warning.',
        account: 'Meridian Ops',
        arr: 118_000,
        role: 'buyer',
        source: 'gong',
        date: '2026-09-10',
      },
      {
        text: "Finance keeps asking me <mark>what next month will cost</mark> and I can't answer.",
        account: 'Kestrel Labs',
        arr: 96_000,
        role: 'admin',
        source: 'int',
        date: '2026-08-31',
        low: true,
      },
    ],
    trend: [7, 12, 12, 9, 12, 16, 14, 12, 16, 19, 15, 16],
  },
  {
    key: 'p12',
    outcome: 'o4',
    title: 'SSO setup requires contacting support',
    accounts: 8,
    arr: 720_000,
    mentions: 15,
    pain: 1,
    low: 0,
    link: null,
    solutions: [['Self-serve SAML setup', 12]],
    quotes: [
      {
        text: 'Took <mark>three weeks of back-and-forth</mark> to get Okta working.',
        account: 'Cobalt Insurance',
        arr: 310_000,
        role: 'admin',
        source: 'zd',
        date: '2026-08-16',
      },
    ],
    trend: [11, 7, 8, 12, 9, 6, 9, 12, 8, 6, 10, 11],
  },
]

/** The PRD's example question pack. */
export const PACK_DEFINITION = {
  pack: 'product-insights',
  version: '0.3.0',
  judge: 'jev-1.13.0',
  item_questions: {
    states_problem: {
      type: 'noul',
      instructions: 'Customer describes a problem, limitation or pain with the product',
    },
    proposes_solution: { type: 'noul', instructions: 'Customer asks for a specific feature or change' },
    workaround: { type: 'noul', instructions: 'Customer describes a manual workaround they use today' },
    pain: { type: 'score', levels: ['mild_annoyance', 'slows_work', 'blocks_work', 'deal_breaker'] },
    role: { type: 'choice', options: ['end_user', 'admin', 'buyer', 'executive', 'unknown'] },
  },
  thresholds: { detect: 0.6, place_confidence: 0.7 },
} as const
