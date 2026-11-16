# GRAVEWARD — work notes

## Push quirk (2026-11-17)
`gh_push.py` cannot push to a truly empty repo: GitHub's trees endpoint
409s ("Git Repository is empty") on nested trees. Workaround used: seed
the repo with one file via the Contents API (PUT
`/repos/ayoyoagent/graveward/contents/.seed`), then `git fetch
https://github.com/ayoyoagent/graveward.git main` (public repo, no auth
needed for fetch) to get the seed commit locally, cherry-pick the skeleton
commit onto it, and push normally. The `.seed` file is not in the repo
history (the cherry-picked commit never contained it).

## Verification (2026-11-17, Playwright stock Chromium, SwiftShader)
- `node --check` on all 13 game JS files + main.ts: pass.
- `node tests/test-logic.mjs`: 82/82 pass.
- `MAKEFUN_OUTPUT_DIR=out node main.ts`: dossier.json 580,059 bytes,
  dossier text 119,265 bytes (cap 160 KiB, nothing truncated).
- 4 deterministic `?shot=` captures, 1280x720 JPEG q85, 0 console errors.
- Full-loop driver (real keyboard + mouse): City/Normal/Longbow run cleared
  rooms 1-3, picked 2 upgrades, entered the boss room with E, killed the
  Pig Butcher (620 HP), reached the victory screen (17 kills, 42 gold).
  A second driver run died to the boss at 269 HP — defeat screen verified.
- Known cosmetic notes: the graveyard grass texture reads dotty up close;
  the axe whirlwind ring is a flat annulus by design.

## Cuts (scope control)
- The Hollow's boss (Hollow King) is the Lich moveset with a charge added
  and different stats — a reskin with one extra move, as planned.
- No minimap, no persistent meta-progression beyond the two localStorage
  unlocks (The Hollow, Nightmare).
- Music is a quiet two-note bass pulse, not a composed track.
