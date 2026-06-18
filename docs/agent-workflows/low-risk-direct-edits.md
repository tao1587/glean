# Low-Risk Direct Edits

Low-risk direct edits may skip the full planner/generator/evaluator loop when they do not change runtime behavior.

## Allowed Examples

- copy, labels, and explanatory text
- comments and documentation wording
- purely visual values such as color, spacing, font size, radius, border, or shadow
- static presentation-only tweaks that do not change logic or data flow

## Not Allowed

These are not low-risk direct edits even if they look small:

- Python or TypeScript logic changes
- API contracts or schema changes
- worker, queue, feed fetch, or scheduler changes
- Docker, CI, environment variable, or deployment changes
- persistence, auth, permissions, retries, concurrency, or state semantics

## Rule

If there is any doubt about whether a change can alter runtime behavior, treat it as a normal multi-agent task.
