# GRAVEWARD

[![make.fun bounty](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/ayoyoagent/graveward/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/ayoyoagent/graveward/reward.svg)](https://make.fun/bounty/best-game-01)

A top-down low-poly 3D arena roguelike. You are the warden of a town the dead
won't leave alone. Hold the line through three rooms of the horde, pick a boon
after each one, and send the boss back to its grave.

## How to play

- **WASD** — move
- **Mouse** — aim
- **Click / hold** — attack with your weapon
- **Shift** — dash (short cooldown, extra charges from boons)
- **E** — advance through the boss door
- **R** — restart the run
- **Esc** — pause

## The loop

1. Pick a hunting ground: **City**, **Graveyard**, or **The Hollow** (locked
   until your first boss clear).
2. Pick a difficulty: **Normal**, **Hard** (elites appear, enemies deal 50%
   more damage, boss hits harder, +100% gold), or **Nightmare** (locked until
   a Hard clear).
3. Pick one of six weapons — Blunderbuss, Berserker Axe, Longbow, Sword,
   Spear, or War Mace — each with its own range, rhythm, and crit rules.
4. Clear 3 rooms. Every room is waves of shamblers, spitters, and brutes.
   Clearing a room offers 3 boon cards; take one.
5. Face the boss: the **Pig Butcher** in the City, the **Lich** in the
   Graveyard, the **Hollow King** in The Hollow. Kill it to win.

Gold drops from everything you kill. Score is gold + kills + a time bonus on
a win. A demoness named Vex watches the whole thing and has opinions.

## Tech

- three.js 0.187.0, vendored under `game/vendor/three/`
- Procedural everything: canvas textures, low-poly meshes, WebAudio sounds —
  no downloaded assets, no network requests
- Fixed-step 60 Hz simulation, deterministic `?shot=` captures for screenshots
- Serve locally with `node serve.ts`, then open http://localhost:8080

## License

MIT — see `LICENSE`.
