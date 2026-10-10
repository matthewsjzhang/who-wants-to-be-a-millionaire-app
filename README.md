# Millionaire Quiz

A static, backend-free quiz-show web app in the style of a classic "win a million" TV game show. It is an
**unofficial fan project**. It is not affiliated with, endorsed by, or connected to the show or its producers.
It uses no logos and no broadcast audio (all sound is synthesised with WebAudio).

## Features

- 15-step prize ladder with safe havens, "Final answer?" confirmation, suspense reveal and walk away.
- Lifelines: 50:50, Phone a Friend, Ask the Audience, Switch the Question, Double Dip, plus your own custom lifelines
  (remove-wrong, friend hint, audience poll, skip, second chance, extra time, host hint). Toggle them per game.
- Library of 55 "episode-style" question sets, searchable and filterable, sorted by episode or style era.
- Custom games: write your own questions, ladder (1-20 rungs, custom safe havens), spares, timer and lifelines.
  Import and export as JSON. Your custom games are shown above the library on the menu.
- Optional clock mode, answer shuffling, host commentary, reduced motion, mute and volume.
- Save and resume, history and stats dashboard, local "report question" flags.
- Keyboard play (A-D / 1-4, Enter, Esc, F/P/U/S/D lifelines, W walk, L ladder, M mute, ? help), ARIA live
  announcements, focus-trapped dialogs, mobile layout with a ladder drawer.
- Installable PWA that works offline once loaded.

## Honesty note about the question sets

The sets are named "episode-style". They are **original questions written for this project, inspired by the
show's format**. They are not transcriptions of broadcast questions and must not be presented as real episodes.
The "style era" date is only a flavour label. Questions were fact-checked, but errors are possible: use the
"Report question" button to flag one locally.

## Quick start (Windows)

Double-click `start-millionaire.cmd`. It installs dependencies on the first run, builds the app and opens it at http://localhost:5174. Always use that address: saves, custom games and stats are stored per address in your browser.

## Commands

```bash
npm install
npm run dev          # dev server (regenerates the bank manifest first)
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ (default http://localhost:4173)
npm test             # unit/component tests (vitest + jsdom)
npm run e2e          # Playwright tests (builds and previews the app itself)
npm run typecheck
npm run lint
npm run validate     # validate every question bank
npx playwright install chromium   # one-time browser download for e2e
```

Dev/test URL parameters: `/?seed=1&bank=ep-001#/game` starts a deterministic classic game from a bank
(fixed seed, no answer shuffle).

## Add your own question bank

1. Copy an existing file in `src/data/banks/` to `src/data/banks/ep-056.json` (the file name must equal `id`).
2. Edit the fields:
   - `schemaVersion: 1`, `id` (`ep-056`), unique `episode` number, `name`, ISO `date`,
     `edition` (`US`/`UK`/`AU`/`INT`), `provenance` (`"episode-style"`, or `"transcribed"` which requires `sources`).
   - `questions`: exactly 15, each with `id`, `text`, 4 `answers`, `correct` (0-3), `difficulty` (1-5,
     non-decreasing: Q1-5 -> 1-2, Q6-10 -> 3, Q11-13 -> 4, Q14-15 -> 5), optional `category` and `explanation`.
   - `spares`: at least 3 (used by Switch the Question), spread across difficulties.
3. Run `npm run validate`. It fails on structural errors (duplicates, wrong counts, bad difficulty bands...) and
   prints warnings (near-duplicates, skewed correct-answer positions, very long text).
4. `npm run dev` / `npm run build` regenerate `src/data/banks.manifest.json` automatically and the new set appears
   in the library.

Only write original questions with stable, well-documented facts. Do not copy broadcast questions.

## Project layout

`src/core` (pure engine, ladder, lifelines, simulation), `src/data` (schema, loader, banks), `src/storage`
(localStorage wrappers, import/export), `src/audio`, `src/ui` (screens, components, keyboard, a11y),
`tests/unit`, `tests/e2e`, `scripts` (manifest and validation). See `PLAN.md` for the design.

## Licence and credits

Fan project for personal and educational use. All trademarks belong to their owners.
