# Venue Profiles Implementation Plan

**Goal:** Ship an optional two-venue pilot for practice and solo heats, with
matching conditions in tour challenges.

**Design:** `docs/superpowers/specs/2026-10-28-venue-profiles-design.md`

## Completed work

- [x] Add sourced Sotavento and Sylt profiles in `tour/venues.json`.
- [x] Load and validate venue ids, aliases and supported wind settings on the
  local server.
- [x] Add `GET /api/local/venues`; resolve event locations to pilot profiles
  only while the `venues` mod is enabled.
- [x] Add an optional venue selector that applies the chosen conditions to
  practice and solo heat starts and can restore weekly wind.
- [x] Add original local landmark artwork to the venue selector and active
  venue HUD for Sotavento and Sylt.
- [x] Build stationary, lit and material-batched Three.js coast scenes with
  venue-specific terrain, event structures, and landform details.
- [x] Pass event-matched conditions into tour AI heats and apply the returned
  conditions to the player's next solo heat.
- [x] Document the current snapshot capability and the source-data limit.

## Deferred work

- [ ] Refresh and reconcile 2026 tour records once PWA publishes 2026
  freestyle results (none on 2026-10-30).
- [ ] Inventory and map every 2006–2026 freestyle event location.
- [ ] Add distinct supported scene profiles and connect venues to tournament
  events.
- [ ] Research historical freestyle venues from 1997–2005.
