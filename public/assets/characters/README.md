# Character Assets — `public/assets/characters/`

Place the four GLB files listed below in this directory.
All characters must share the same bone naming convention so animation clips
are interchangeable across rigs (standard Mixamo / Quaternius skeleton).

---

## Required files

| Filename            | Source                    | License | Notes                                  |
|---------------------|---------------------------|---------|----------------------------------------|
| `xbot.glb`          | mixamo.com / X Bot        | Free    | Download with ALL animations embedded  |
| `ybot.glb`          | mixamo.com / Y Bot        | Free    | Download with ALL animations embedded  |
| `adventurer.glb`    | quaternius.com            | CC0     | "Animated Characters Pack"             |
| `explorer.glb`      | quaternius.com            | CC0     | "Ultimate Animated Character Pack"     |

---

## Mixamo export instructions (X Bot / Y Bot)

1. Go to [mixamo.com](https://www.mixamo.com) (free Adobe account required).
2. Click **Characters** → search "X Bot" → select it.
3. Choose an animation in the **Animations** tab — export the character with each
   animation included.  You need at minimum: **Idle**, **Walking**, **Running**, **Jump**.
4. Click **Download** → format **FBX for Unity** (binary).
5. Repeat for all 4 animations (or export multiple at once if your Mixamo tier allows).
6. Combine the 4 FBX files onto one shared skeleton and export a single GLB.

   `gltf-transform` does **not** read FBX (it only converts between
   glTF/GLB variants), and `gltf-transform merge` combines separate scenes
   rather than retargeting animations onto one shared rig — neither step
   produces what's needed here. Use **Blender** instead (free):

   a. In Blender, **File → Import → FBX** the first clip (e.g. Idle) —
      this becomes your base rig.
   b. For each remaining clip (Walk, Run, Jump): **File → Import → FBX**
      again, then in the **Action Editor** / **NLA Editor**, copy that
      action onto the base rig's armature (Mixamo exports share the same
      skeleton, so actions transfer directly — no retargeting needed) and
      delete the duplicate imported armature/mesh.
   c. With only the base rig + mesh + all 4 actions remaining, **File →
      Export → glTF 2.0 (.glb)**, with **Animation → Export all actions**
      enabled.

7. Verify the result (this step is still accurate — `gltf-transform` reads
   GLB fine, it just can't produce one from FBX):

```bash
gltf-transform inspect xbot.glb
# Should list: Idle, Walking, Running, Jump (or similar names) in the Animations section.
```

8. Save the merged file as `public/assets/characters/xbot.glb`.
   Repeat steps 2–8 for **Y Bot** → `ybot.glb`.

---

## Quaternius instructions (Adventurer / Explorer)

1. Go to [quaternius.com](https://quaternius.com/packs/animatedcharacters2.html).
2. Download the **Animated Characters** pack (CC0, no account needed).
3. Inside the archive find the GLB files — each already has idle/walk/run/jump embedded.
4. Copy the "Adventurer" GLB here as `adventurer.glb`.
5. Repeat with any "Explorer" or soldier variant → `explorer.glb`.

---

## Verification

After placing all four files, run:

```bash
npx vitest run src/game/player/__tests__/CharacterLibrary.test.ts
```

All catalog integrity tests should pass (they do not require the GLBs on disk).
End-to-end clip playback can be tested in-game by calling:

```typescript
await game.setCharacter('xbot');   // swaps avatar at runtime
```

Then walk/run/jump to confirm all animation states play without T-pose glitches.
