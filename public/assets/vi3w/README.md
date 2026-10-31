# Vi3W Assets

Interactive world objects generated at **app.vi3w.in** and exported as GLB.

## Expected files

| File | Category | Description |
|---|---|---|
| `treasure/treasure_chest.glb` | Collectible | Treasure chest — reward for exploration |
| `artifact/ancient_artifact.glb` | Collectible | Ancient artifact — cultural point of interest |
| `signboard/signboard.glb` | Interactive | Signboard — location label / wayfinding post |

## How to generate

1. Open **app.vi3w.in** in your browser.
2. Generate each asset (see prompts below).
3. Export as **GLB** (binary GLTF).
4. Save to the matching subdirectory above.

### Suggested prompts

**Treasure chest** (`treasure/treasure_chest.glb`)
> Wooden treasure chest, iron lock and hinges, slightly worn, game-ready,
> low-poly, PBR materials, centred at origin, Y-up

**Ancient artifact** (`artifact/ancient_artifact.glb`)
> Ancient stone artifact, carved runes, weathered surface, museum display
> object, low-poly, PBR, centred at origin, Y-up, ~0.4 m tall

**Signboard** (`signboard/signboard.glb`)
> Wooden directional signboard on a post, carved text panel, weathered wood
> with iron bracket, low-poly, PBR, origin at post base, Y-up, ~1.5 m tall

## Usage in code

Assets are served statically by Vite at `/assets/vi3w/<category>/<file>`.
The upcoming `PropLoader` (P4-02) will fetch them via manifest and spawn
instances at OSM-tagged locations in the game world.
