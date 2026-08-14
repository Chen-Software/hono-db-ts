/**
 * Decide whether a UI component should hydrate as a client-side island.
 *
 * This is the single source of truth for the "smart" interactivity predicate
 * used across the component library. Every component that can render either as
 * static HTML or as a hydrated island routes its decision through this helper
 * so the opt-in / opt-out / auto-detect semantics can never drift.
 *
 * @param interactive - the component's `interactive` prop (boolean | undefined)
 * @param hasSignal   - true when a behavioral signal is present on the
 *                      component — i.e. an event handler (`onClick`,
 *                      `onValueChange`, …) or controlled/default state
 *                      (`value`, `checked`, `open`, …) that can only do
 *                      something with client-side JavaScript.
 *
 * Semantics:
 *  - `interactive === false` → never hydrate (explicit opt-out)
 *  - `interactive === true`  → always hydrate (explicit opt-in)
 *  - `interactive` omitted    → hydrate iff `hasSignal`
 *
 * For a component that is auto-interactive by default (Tier-1: overlays,
 * modals, splitter, …), pass `hasSignal = true` so it hydrates unless
 * explicitly opted out.
 */
export function shouldHydrate(
	interactive: unknown,
	hasSignal: boolean,
): boolean {
	return interactive !== false && Boolean(interactive || hasSignal);
}
