import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Rules skipped on every page. Each entry names the axe rule and why it cannot pass. */
const EXCEPTIONS: readonly { rule: string; reason: string }[] = []

/**
 * Fails the test when axe finds a WCAG 2.2 AA violation on the page once its transitions have finished.
 * A button that just left `disabled` fades from half opacity, and axe reads the blend as a contrast failure.
 */
export async function expectAccessible(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)))
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
