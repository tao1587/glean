# Evaluator Rubric

The evaluator must grade the output independently instead of accepting the generator's self-summary.

## Required Checks

1. Contract compliance
   - Did the work satisfy the sprint contract exactly?
2. Behavioral correctness
   - Do the changed flows behave correctly under the intended use path?
3. Regression risk
   - Were adjacent flows or invariants affected?
4. Repository fit
   - Does the change align with repository docs, conventions, and architecture?
5. Verification quality
   - Were tests or runtime checks actually meaningful for the change?

## Failure Rule

If any required check fails, the evaluator must reject the sprint and explain:

- what failed
- where it failed
- what evidence supports the finding
- what the next iteration should fix
