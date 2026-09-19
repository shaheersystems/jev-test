import { moderate, type Message } from './moderate.ts'
import { policySet } from './policies.ts'

const inbox: Message[] = [
  {
    channel: '#platform',
    purpose: 'Building and running the deployment platform',
    author: 'dana',
    text: 'Re-ran the migration on staging, all green. Ship it whenever.',
  },
  {
    channel: '#platform',
    purpose: 'Building and running the deployment platform',
    author: 'reese',
    text: 'This PR is garbage and so is whoever wrote it. Do you people even read the style guide?',
  },
  {
    channel: '#support',
    purpose: 'Handling inbound customer tickets',
    author: 'kim',
    text: 'Prod is down, use the admin key sk_live_9f2b7c4e1a08d5361be07a9c to get in.',
  },
  {
    channel: '#support',
    purpose: 'Handling inbound customer tickets',
    author: 'ali',
    text: 'Refunding Maria Alvarez, maria.alvarez@example.com, card ending 4417, order #88213.',
  },
  {
    channel: '#random',
    purpose: 'Off-topic chatter',
    author: 'sam',
    text: 'My cousin is hiring senior Go devs at 2x market rate, DM me and I will refer you.',
  },
]

/** Free-tier gateway keys are rate-limited; space the demo calls out a little. */
const DELAY_MS = 6_000

console.log(`policy set: ${policySet.org} @ ${policySet.version}`)
console.log(`active rules: ${policySet.policies.filter((p) => p.enabled).length}\n`)

for (const [index, message] of inbox.entries()) {
  if (index > 0) await Bun.sleep(DELAY_MS)

  let verdict
  try {
    verdict = await moderate(message, policySet)
  } catch (error) {
    console.log(`! ERROR ${message.channel} — ${message.author}: ${(error as Error).message}`)
    console.log()
    continue
  }

  const icon = { allow: '✓', flag: '⚑', block: '✕' }[verdict.decision]
  console.log(`${icon} ${verdict.decision.toUpperCase()} [${verdict.route}] ${message.channel} — ${message.author}`)
  console.log(`  "${message.text}"`)

  for (const violation of verdict.violations) {
    const measured = violation.measured.toFixed(2)
    console.log(`  → ${violation.title} (${violation.policyId}: ${measured} ≥ ${violation.threshold})`)
  }

  console.log()
}
