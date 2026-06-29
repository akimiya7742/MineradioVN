<!--
 * Modified by akimiya7742 on 29/06/2026
 * Original work Copyright (C) 2026 XxHuberrr
-->
# Mineradio Project Rules (AGENTS.md)

## Project Identity

Mineradio is an immersive Windows Electron desktop music player. Its core user experience includes search, playback, custom playlists, dynamic lyrics, a 3D playlist rack, interactive particle visual presets, a DIY visual control console, and seamless GitHub automated updates.

## Start Every New AI Agent Thread Here

Thoroughly read and parse the following critical system files:
- `AGENTS.md`
- `docs/PROJECT_MEMORY.md`
- For SVG glass textures, read: `docs/GLASS_SVG_TEXTURE.md`
- For deployments/releases, read: `CHANGELOG.md`, `RELEASE.md`, and `package.json`

## Repository Layout

```text
Mineradio/resources/app/
├─ public/
│  ├─ index.html       # Main UI, CSS, lyrics, particles, 3D rack, visual console
│  └─ vendor/           # Local vendor dependencies
├─ desktop/             # Electron main/preload scripts
├─ build/               # Packaging assets and installer build scripts
├─ docs/                # Project memory, design guidelines, long-term constraints
├─ server.js            # Local API, music source handlers, update checks, hotfixes
├─ dj-analyzer.js       # Beat and real-time audio spectrum analysis
├─ package.json         # Versioning, build commands, and electron-builder configurations
└─ CHANGELOG.md         # Release changelogs (English/Vietnamese updates prioritized at the top)
```

## Developer Commands

```powershell
npm start
node --check server.js
npm run build:win:dir
npm run build:win
```

The frontend core logic resides entirely within `public/index.html`. This workspace directory is actively utilized by the running instance of `Mineradio.exe`. Therefore, any modifications can be evaluated instantly by restarting the outer `E:\桌面\播放器软件\Mineradio\Mineradio.exe` executable. 

*Note:* There is no standalone automated test suite. After making any changes, you must perform at least the following validation steps:

```powershell
git diff --check
node --check server.js
```

Always manually check key interactions within the Electron instance or the targeted browser environment. If the build environment lacks `electron-builder` when compiling the final installer, execute `npm install` inside `E:\桌面\播放器软件\Mineradio\resources\app` before triggering `npm run build:win`.

## Release Workflow

When launching a new release:
1. Bump the version numbers inside `package.json` and `package-lock.json`.
2. Add comprehensive release details at the top of `CHANGELOG.md`.
3. Execute standard syntax and trailing whitespace sanity checks.
4. Run the production build command: `npm run build:win`.
5. Upload the generated assets to GitHub Releases:
   - `dist/Mineradio-x.y.z-Setup.exe`
   - `dist/Mineradio-x.y.z-Setup.exe.blockmap`
   - `dist/latest.yml`
   - Any required incremental lightweight JSON patches (`Mineradio-legacy-x.y.z.json`).
6. Skip generating patches for the legacy 0.9.x series; generate cross-minor-version patches for 1.0.x/1.1.x series strictly on an as-needed basis.

If GitHub CLI (`gh auth` / asset uploads) requires a network proxy, route traffic explicitly through the local proxy endpoint `127.0.0.1:10808`. **Do not** use the obsolete proxy `127.0.0.1:26001` (it will trigger connection refused errors). For temporary shell setups, clear `HTTP_PROXY`/`HTTPS_PROXY` and redefine them to `http://127.0.0.1:10808`.

## User Preferences & Dev Vibe

- **Communication Language:** Friendly Vietnamese with tech-savvy/teen slang, using professional computer and tech terminology where appropriate.
- **Workflow Style:** Cut the fluff. Code directly, patch cleanly, verify after fixing, and bundle releases whenever possible.
- **UI/UX Aesthetics:** High-end, sleek dark mode, sophisticated glassmorphism, fluid animations. Absolutely **NO** cheap gradients, excessive/unreadable transparency, misaligned layouts, flashing elements, or micro-stutters.
- **Visual Quality Definition:** Textures, buttery-smooth frame rates, and render stability must coexist harmoniously. Performance tuning must never compromise existing visual fidelity.
- **Glassmorphism:** The current SVG glass filter layout is the gold standard of this app. Refer strictly to `docs/GLASS_SVG_TEXTURE.md`.

## Memory Protocol

Whenever the user states phrases like *"keep this"*, *"this works perfectly"*, *"I love this feature"*, *"remember this configuration"*, or *"don't forget this in future updates"*:
1. Analyze exactly what the user is validating (e.g., codebase patch, UI/UX feel, interaction workflow, release pipeline, or architectural convention).
2. Append the verified insights and rules directly into the designated section of `docs/PROJECT_MEMORY.md`.
3. If the feedback targets fragile visual frameworks (e.g., SVG glass elements, custom particle presets, or the 3D playlist rack), update the corresponding specialized tech documentation simultaneously.
4. Clearly log the modification date, affected filenames, crucial operational parameters, and precise technical boundaries to prevent regressions.
5. If changes are bundled with active code commits, push the memory documentation together; otherwise, single documentation maintenance commits are perfectly acceptable.

## Guardrails & Constraints

- **Do NOT** blindly refactor or overwrite large modules of the visual engine inside `public/index.html`. Always locate and interface with existing helper functions and global states first.
- **Do NOT** modify or interfere with the cinematic beat-camera engine unless explicitly requested by the user.
- **Do NOT** reintroduce patched legacy bugs (e.g., sidebar layout flickering, play/pause input dropping inside the debug console, or the 3D rack resetting abruptly back to the default galaxy environment).
- **Do NOT** implement performance optimizations for search results, sidebar playlists, or the 3D rack that rely on rendering entire data collections all at once. Use virtual scrolling or batch processing.
- **Do NOT** downgrade the highly-polished SVG glass textures into basic CSS backdrops or cheap transparent panels.
