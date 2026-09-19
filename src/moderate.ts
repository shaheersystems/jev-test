import { experimental_evaluate as evaluate } from 'ai'
import type { Experimental_EvaluationQuestion as EvaluationQuestion } from 'ai'
import type { Policy, PolicyAction, PolicySet } from './policies.ts'

const MODEL = 'typesafe-ai/jev'

/** Question id for the routing question. Underscored so it cannot collide with a policy id. */
const ROUTE_ID = '_route'

export type Message = {
  channel: string
  /** What the channel is for — the model reads this when judging relevance. */
  purpose: string
  author: string
  text: string
}

export type Violation = {
  policyId: string
  title: string
  action: PolicyAction
  /** P(true) for a boolean policy, the level for a score policy. */
  measured: number
  threshold: number
}

export type Verdict = {
  decision: 'allow' | 'flag' | 'block'
  /** Which review queue this belongs in, per the org's routing table. */
  route: string
  violations: Violation[]
  /** Every reading, violated or not. Log these to tune thresholds later. */
  readings: Record<string, number>
}

function toQuestion(policy: Policy): EvaluationQuestion {
  switch (policy.kind) {
    case 'boolean':
      return policy.criteria
        ? { type: 'boolean', instructions: policy.instructions, criteria: policy.criteria }
        : { type: 'boolean', instructions: policy.instructions }
    case 'score':
      return { type: 'score', instructions: policy.instructions, criteria: policy.levels }
  }
}

/**
 * Evaluate one message against an org's policy set.
 *
 * Every enabled policy becomes one question, and all of them are answered in a
 * single call against the same state. Thresholds and the block/flag decision
 * stay here in code, so changing how strict a rule is never means re-prompting.
 */
export async function moderate(message: Message, policies: PolicySet): Promise<Verdict> {
  const active = policies.policies.filter((policy) => policy.enabled)

  const questions: Record<string, EvaluationQuestion> = {
    [ROUTE_ID]: {
      type: 'choice',
      instructions: 'Which review queue does this message belong in?',
      criteria: policies.routing,
    },
  }
  for (const policy of active) {
    questions[policy.id] = toQuestion(policy)
  }

  const { answers } = await evaluate({ model: MODEL, state: message, questions })

  const violations: Violation[] = []
  const readings: Record<string, number> = {}

  for (const policy of active) {
    const answer = answers[policy.id]
    if (!answer) continue

    let measured: number
    if (answer.type === 'boolean') {
      measured = answer.probability
    } else if (answer.type === 'score') {
      measured = answer.score
    } else {
      continue
    }

    readings[policy.id] = measured
    if (measured >= policy.threshold) {
      violations.push({
        policyId: policy.id,
        title: policy.title,
        action: policy.action,
        measured,
        threshold: policy.threshold,
      })
    }
  }

  // Worst offenders first, so a reviewer reads the reason that drove the decision.
  violations.sort((a, b) => Number(b.action === 'block') - Number(a.action === 'block'))

  const routeAnswer = answers[ROUTE_ID]
  const route = routeAnswer?.type === 'choice' ? routeAnswer.choice : 'unknown'

  const decision = violations.some((violation) => violation.action === 'block')
    ? 'block'
    : violations.length > 0
      ? 'flag'
      : 'allow'

  return { decision, route, violations, readings }
}
