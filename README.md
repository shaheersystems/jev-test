# jev-test

Policy-driven message moderation built on [jev](https://docs.typesafe.ai/introduction), TypeSafe's
System One model, via the Vercel AI SDK.

A message goes in, a verdict comes out: `allow`, `flag`, or `block`, plus the review queue it
belongs in and the reason for the call. The rules it enforces live entirely in config.

## Install

```bash
bun install
```

Set a gateway key in `.env.local`:

```
AI_GATEWAY_API_KEY=...
```

## Run

```bash
bun start
```

Moderates a sample inbox and prints one verdict per message:

```
✓ ALLOW [none] #platform — dana
  "Re-ran the migration on staging, all green. Ship it whenever."

✕ BLOCK [security] #support — kim
  "Prod is down, use the admin key sk_live_..."
  → No credentials in chat (credentials: 0.97 ≥ 0.4)
```

## Layout

| File | Role |
| --- | --- |
| `src/policies.ts` | The rules. Everything an org changes lives here. |
| `src/moderate.ts` | The engine. Never mentions a specific rule. |
| `src/index.ts` | Demo run over a sample inbox. |

## Changing the policy

A policy is a plain object. Add one by appending to `policySet.policies`:

```ts
{
  id: 'legal_advice',
  title: 'No legal commitments in chat',
  enabled: true,
  action: 'flag',
  kind: 'boolean',
  instructions: 'Does the message make a legal or contractual promise to a customer?',
  criteria: {
    true: 'A commitment about liability, refunds beyond policy, or contract terms',
    false: 'Explaining existing published policy is not a new commitment',
  },
  threshold: 0.6,
}
```

Two kinds are available:

- **`boolean`** — a yes/no rule. The model returns P(true); violated when it reaches `threshold`.
- **`score`** — a graded rule with ordered `levels`. The model returns a fractional level;
  violated when it reaches `threshold`.

`action` decides what a violation means: `block` fails the whole message, `flag` sends it to review.
Set `enabled: false` to keep a rule on the books without evaluating it.

`policySet.routing` is the set of review queues. The model picks exactly one per message.

## How it works

Every enabled policy becomes one question, and all of them are answered in a **single** call
against the same state:

```ts
const { answers } = await evaluate({
  model: 'typesafe-ai/jev',
  state: { channel, purpose, author, text },
  questions,   // one per enabled policy, plus routing
})
```

Cost and latency stay flat as rules are added.

Thresholds and the block/flag decision are applied in code, not by the model. Tightening a rule
is an edit to a number — no re-prompting, no change in model behavior to reason about. Thresholds
are deliberately asymmetric: the credentials rule sits at `0.4` because a missed key leak costs far
more than a false positive, while harassment sits at `0.7` to avoid blocking blunt code review.

`verdict.readings` returns every measurement, violated or not. Log it and thresholds can be tuned
against real traffic instead of guesswork.

## Notes

- `probability` on a boolean answer is *P(true)*, not confidence. `0.5` means genuinely uncertain;
  `0.02` is a confident no.
- `experimental_evaluate` is experimental and its signature can change in a patch release.
- Free-tier gateway keys are rate-limited on this model. The demo spaces calls out and reports
  per-message failures rather than aborting the run.
