import { test } from 'node:test'
import { scopedJourney } from './acceptance/scoped-journeys'
for (const pattern of ['crm', 'issues'] as const) {
  test(`${pattern}: scoped build → assistant plan → review → recover → complete → cancel`, async () => { await scopedJourney(pattern) })
}
