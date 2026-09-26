import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Rules skipped on every page. Each entry names the axe rule and why it cannot pass. */
const EXCEPTIONS: readonly { rule: string; reason: string }[] = []

/** Fails the test when axe finds a WCAG 2.2 AA violation on the page as it stands. */
export async function expectAccessible(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA)
    .disableRules(EXCEPTIONS.map((exception) => exception.rule))
    .analyze()
  const found = violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.helpUrl})\n` +
      violation.nodes.map((node) => `  ${node.target.join(' ')}\n    ${node.failureSummary ?? ''}`).join('\n'),
  )
  expect(found, `WCAG 2.2 AA violations on ${page.url()}`).toEqual([])
}
