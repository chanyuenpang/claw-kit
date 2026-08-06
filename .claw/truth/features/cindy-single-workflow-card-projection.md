# Cindy single workflow-card projection

<!-- state: current -->
## Current behavior

- Cindy treats the canonical `.claw` plan as the only workflow store and projects it into one Ghost progress card per active session.
- The Cindy session-start adapter calls `claw context --host cindy` asynchronously and projects only a bound `activeWorkflow` into the existing card; it does not inject raw context into the model or restore the retired `auto-claw` path.
- Only a `plan.create` execution may allocate a new card id, using that tool call's id. `plan.resume`, `plan.done`, task mutations, and other later plan mutations look up and update the existing session card.
- The card keeps rendering canonical plan data: goal, task totals, current task, status, and completion state. A terminal `plan.done` changes the existing card to done; it does not create a second terminal card.
- The first active projection may expand and authorize the existing card's Goal continuation surface without changing card ownership.

## Implementation and verification anchors

- `packages/cindy-adapter/plugin/main.js` (`applyProjection`)
- `packages/cindy-adapter/plugin/node/claw-worker.cjs`
- `packages/cindy-adapter/test/plugin-main.test.mjs`
- `packages/cindy-adapter/README.md`
- `packages/cindy-adapter/references/cindy-adapter-design.md`

## Search terms

- `Cindy single workflow card`
- `plan.create card id`
- `plan.resume update card`
- `plan.done update card`
