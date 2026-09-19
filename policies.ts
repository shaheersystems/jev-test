/**
 * Org moderation policy. Everything a company can change lives in this file —
 * moderate.ts never mentions a specific rule.
 */

export type PolicyAction = 'block' | 'flag'

type PolicyBase = {
  /** Stable id. Also used as the question id sent to the model. */
  id: string
  title: string
  /** Turn a rule off without deleting it. Disabled rules are never sent. */
  enabled: boolean
  /** What happens when this rule is violated. */
  action: PolicyAction
}

export type Policy = PolicyBase &
  (
    | {
        /** A yes/no judgment. Violated when P(true) >= threshold. */
        kind: 'boolean'
        instructions: string
        /** Optional: pin down what each side of the question means. */
        criteria?: { true?: string; false?: string }
        threshold: number
      }
    | {
        /** A graded judgment. Violated when the level reaches threshold. */
        kind: 'score'
        instructions: string
        /** Ordered levels, mildest first. Indexed 0..levels.length - 1. */
        levels: string[]
        /** Compared against the returned level; fractional values are fine. */
        threshold: number
      }
  )

export type PolicySet = {
  org: string
  version: string
  /** Review queues. The model picks one; keys are the queue names. */
  routing: Record<string, string>
  policies: Policy[]
}

export const policySet: PolicySet = {
  org: 'acme',
  version: '2026-09-19',

  routing: {
    none: 'Ordinary work conversation; nothing for a reviewer to look at',
    conduct: 'Interpersonal problems: insults, threats, sustained hostility',
    security: 'Leaked credentials, tokens, keys, or internal-only material',
    privacy: 'Personal data about a customer or employee',
    spam: 'Advertising, recruiting, or mass solicitation',
  },

  policies: [
    {
      id: 'harassment',
      title: 'No harassment or personal attacks',
      enabled: true,
      action: 'block',
      kind: 'boolean',
      instructions: 'Does the message attack, demean, or threaten a person or group?',
      criteria: {
        true: 'Insults, slurs, threats, or sustained hostility aimed at someone',
        false: 'Blunt criticism of code, work, or ideas is not a personal attack',
      },
      threshold: 0.7,
    },
    {
      id: 'credentials',
      title: 'No credentials in chat',
      enabled: true,
      action: 'block',
      kind: 'boolean',
      instructions: 'Does the message contain a live secret, such as an API key, token, or password?',
      criteria: {
        true: 'A real-looking secret value someone could paste and use',
        false: 'Naming a secret, or an obvious placeholder such as <YOUR_KEY>',
      },
      // Deliberately low: a missed leak costs far more than a false positive.
      threshold: 0.4,
    },
    {
      id: 'customer_pii',
      title: 'Keep customer personal data out of general channels',
      enabled: true,
      action: 'flag',
      kind: 'boolean',
      instructions: 'Does the message expose personal data about a customer or employee?',
      criteria: {
        true: 'Full name with contact details, address, payment data, or account identifiers',
        false: 'A first name or an internal ticket number on its own',
      },
      threshold: 0.6,
    },
    {
      id: 'solicitation',
      title: 'No advertising or recruiting',
      enabled: true,
      action: 'flag',
      kind: 'boolean',
      instructions: 'Is the message promoting a product, service, or job opportunity?',
      threshold: 0.75,
    },
    {
      id: 'hostility',
      title: 'Keep the tone professional',
      enabled: true,
      action: 'flag',
      kind: 'score',
      instructions: 'How hostile is the tone toward other people in the conversation?',
      levels: [
        'Neutral or friendly',
        'Curt or impatient, but still professional',
        'Dismissive or contemptuous toward a person',
        'Openly aggressive or abusive',
      ],
      // Level 2 and up gets a human look.
      threshold: 2,
    },
    {
      id: 'off_topic',
      title: 'Stay on topic in project channels',
      // Example of a rule an org can keep on the books but leave switched off.
      enabled: false,
      action: 'flag',
      kind: 'score',
      instructions: 'How far from the channel’s stated purpose is this message?',
      levels: ['On topic', 'A brief aside', 'A full unrelated conversation'],
      threshold: 2,
    },
  ],
}
