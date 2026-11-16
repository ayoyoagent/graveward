// GRAVEWARD entry program (Node 22, standard library only).
//
// The game itself is plain static files under game/ — an index.html plus
// ES modules, no build step, no network. This program hands the entry in:
// it copies game/ and screenshots/ from beside this file into /output
// (or $MAKEFUN_OUTPUT_DIR when run locally) and writes /output/dossier.json
// with the vendored make.fun library, which is what the judge reads.
//
// Run it locally like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Guardrails from the scorer's own caps: the dossier text stays under
// 160 KiB, screenshots stay 4 or fewer at 256 KiB each, and game/ stays
// under 993 files and 48 MiB. An entry that breaks one of these is refused
// before it ever reaches the judge, so refuse it here first.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
