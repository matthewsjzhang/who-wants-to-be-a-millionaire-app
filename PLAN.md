# Implementation Plan: Millionaire Quiz Show Web App

(Produced by the Opus 5.5 planner. Source of truth for all implementer agents.)

## 1. Overview
Static, backend-free SPA recreating the show: 15-step ladder, safe havens, final-answer confirmation, walk away, classic + custom lifelines, optional clock mode. Above the library: custom-game editor. Below: searchable library of 50+ original "episode-style" banks (authored by Sonnet workers, checked by a validation script). Sound synthesized via WebAudio. Works offline (PWA).

## 2. Stack: Vite + vanilla TypeScript (no UI framework)
- Vite, TypeScript, tiny `h()` DOM helper + pure reducer. No runtime deps.
- Dev deps: typescript, vite, vitest, jsdom, tsx, @playwright/test, vite-plugin-pwa, eslint, prettier.
- Branding: "Millionaire Quiz"; footer disclaimer "unofficial fan project". No logos, no show audio.

## 3. Folder layout & ownership (WP = work package, section 8)
```
package.json, tsconfig.json, vite.config.ts, index.html, .eslintrc.cjs   WP0
.github/workflows/ci.yml, pages.yml                                      WP10
public/icons/*, public/manifest.webmanifest                              WP10
src/main.ts, src/app/router.ts, src/app/context.ts                       WP0
src/ui/dom.ts                                                            WP0
src/styles/tokens.css, base.css                                          WP0
src/core/types.ts   (ALL shared types, frozen after WP0)                WP0
src/core/rng.ts, ladder.ts, engine.ts                                    WP1
src/core/lifelines.ts, simulate.ts                                       WP2
src/data/schema.ts, bankLoader.ts, scripts/validate-banks.ts, scripts/build-manifest.ts   WP3
src/data/banks/ep-001.json ...                                           WP11-16
src/data/banks.manifest.json (GENERATED, gitignored)                     WP3
src/storage/{store,settings,savegame,history,customGames,io}.ts          WP4
src/audio/sound.ts                                                       WP5
src/ui/components/{hexAnswer,ladderPanel,lifelineBar,modal,audienceChart,phoneDialog,timerRing,hostBubble}.ts, src/ui/screens/game.ts, src/styles/game.css   WP6
src/ui/screens/{menu,setup}.ts, src/styles/menu.css                      WP7
src/ui/screens/editor.ts, src/ui/components/lifelineEditor.ts, src/styles/editor.css   WP8
src/ui/screens/{results,stats,settings}.ts, src/styles/stats.css         WP9
src/ui/keyboard.ts, src/ui/a11y.ts                                       WP10
tests/unit/** (each WP owns tests for its files), tests/e2e/**           WP17
```
WP0 creates STUB files for every module/screen exporting the final interface. Each WP replaces only files it owns. main.ts/router.ts untouched after WP0 except by WP17.

## 4. Data schemas (src/core/types.ts)
```ts
type AnswerIndex = 0|1|2|3;
interface Question { id: string; text: string; answers: [string,string,string,string]; correct: AnswerIndex;
  difficulty: 1|2|3|4|5; category?: string; explanation?: string; reviewed?: boolean; }
interface QuestionBank { schemaVersion: 1; id: string; name: string; episode: number; date: string /*ISO "style era"*/;
  edition: "US"|"UK"|"AU"|"INT"; provenance: "episode-style"|"transcribed"; sources?: string[]; tags?: string[];
  questions: Question[] /*exactly 15*/; spares: Question[] /*>=3*/; }
interface LadderConfig { id: string; name: string; currency: "$"|"£"|"€"|"pts"; prizes: number[] /*1..20 strictly increasing*/;
  safeHavens: number[] /*0-based*/; topPrizeLabel?: string; }
type TimerConfig = {mode:"off"} | {mode:"clock"; secondsPerQuestion:number[]; bankUnusedToLast:boolean; onTimeout:"walk"|"lose"};
type EffectType = "remove-wrong"|"friend-hint"|"audience-poll"|"skip-question"|"second-chance"|"extra-time"|"host-hint";
interface LifelineDef { id: string; name: string; icon: string; effect: EffectType;
  params: {n?:number; accuracy?:number; seconds?:number}; uses: number; availableFromQ?: number; builtIn: boolean; }
interface GameConfig { questions: Question[]; spares: Question[]; ladder: LadderConfig; lifelines: LifelineDef[];
  timer: TimerConfig; shuffleAnswers: boolean; seed: number; sourceBankId?: string; customGameId?: string; }
interface CustomGame { id; name; createdAt; updatedAt; questions: Question[]; spares: Question[]; ladder: LadderConfig; lifelineIds: string[]; timer: TimerConfig; }
interface ExportFile { format:"millionaire-custom"; version:1; games: CustomGame[]; lifelines: LifelineDef[]; }
interface HistoryEntry { id; date; bankId?; customGameId?; reachedQ; outcome:"won"|"walked"|"wrong"|"timeout"; winnings; lifelinesUsed: string[]; durationMs; }
interface Settings { muted; volume; reducedMotion:"system"|"on"|"off"; shuffleAnswers; defaultTimer; hostCommentary:boolean; revealDelayMs; }
```
Ladder presets (ladder.ts): Classic ($/£): 100,200,300,500,1000,2000,4000,8000,16000,32000,64000,125000,250000,500000,1000000; havens [4,9]; DEFAULT. UK 2007 12-question (£): 500,1000,2000,5000,10000,20000,50000,75000,150000,250000,500000,1000000; havens [1,6] (verify). Plus no-safety-net, single-haven, Custom. Engine generic over ladder length N.
Timer presets: Off (default); Clock (15s Q1-5, 30s Q6-10, 45s Q11-14, Q15 45s + banked unused; timeout = forced walk); custom.

## 5. Game state machine (engine.ts, pure reducer `reduce(state, ev, rng)`)
```
INTRO -START-> PRESENTING(q) -ANSWERS_REVEALED-> AWAITING
AWAITING -USE_LIFELINE-> LIFELINE -LIFELINE_DONE-> AWAITING
AWAITING -SELECT(i)-> CONFIRMING(i) -CANCEL-> AWAITING
CONFIRMING -FINAL_ANSWER-> LOCKED(i) -REVEAL-> CORRECT | WRONG
WRONG & second-chance armed & first dip -> AWAITING (answer eliminated)
CORRECT -NEXT-> last? WON : MILESTONE/PRESENTING(q+1)
AWAITING|CONFIRMING -WALK_AWAY-> WALK_CONFIRM -CONFIRM-> GAME_OVER(walked) / CANCEL
AWAITING -TIMEOUT-> GAME_OVER(timeout -> walk|lose)
WRONG(final) -> GAME_OVER(wrong)
```
GameState serializable: phase, config, qIndex, current, eliminated number[], selected?, lifelineUses, activeEffects{secondChanceArmed,audiencePoll,friendHint,hostHint}, timeLeftMs?, bankedMs, usedSpareIds, startedAt, log.
Rules: winningsOnWrong = prize at highest safe haven index below qIndex else 0; winningsOnWalk = prizes[qIndex-1] or 0; Double Dip: once armed no other lifelines/walk on that question; Switch replaces with unused spare of nearest difficulty; walk blocked while LOCKED; answer shuffle once per question via seeded rng with `correct` remapped. Illegal events = no-op (same state). Selectors: currentPrize, guaranteed, availableLifelines, canWalk.

## 6. Module interfaces
```ts
// rng.ts
export interface Rng { next():number; int(min,max):number; shuffle<T>(a:T[]):T[] }  export function createRng(seed:number):Rng; // mulberry32
// ladder.ts
export const LADDER_PRESETS: LadderConfig[]; validateLadder(l):string[]; guaranteedAt(l,qIndex):number; formatMoney(n,currency):string;
// engine.ts
createGame(cfg):GameState; reduce(s,ev,rng):GameState; export const select={prize,guaranteed,canWalk,availableLifelines};
// lifelines.ts
BUILT_IN_LIFELINES (fifty-fifty remove-wrong n=2; phone friend-hint; audience audience-poll; switch skip-question availableFromQ:10 OFF by default; double-dip second-chance OFF by default)
applyEffect(def,state,rng):EffectResult; validateLifeline(def):string[];
EffectResult = {eliminate?:number[]; poll?:number[]; hint?:{answer:number|null;confidence:number;text:string}; replaceQuestion?:Question; addTimeMs?:number; armSecondChance?:true}
// simulate.ts
audiencePoll(q,eliminated,difficulty,rng,accuracy?):number[] /*sums 100, 0 for eliminated; correct ~85% at diff1 falling to ~40% at diff5 w/ noise*/;
friendHint(q,eliminated,difficulty,rng,accuracy?):{answer,confidence,text}
// schema.ts
validateBank(b:unknown):{ok,errors,warnings}; validateCustomGame(g); normalizeText(s)
// bankLoader.ts
listBanks():BankMeta[]; loadBank(id):Promise<QuestionBank>; randomBank(filter?):BankMeta   // manifest + import.meta.glob lazy
// storage (keys mq:v1:settings|save|history(cap 500)|custom|lifelines; try/catch + validation + migrate hook)
getSettings/saveSettings; saveGame/loadSavedGame/clearSavedGame; addHistory/getHistory/getStats; listCustomGames/upsertCustomGame/deleteCustomGame; listCustomLifelines/upsertLifeline/deleteLifeline; exportJSON(ids?)/importJSON(text):{imported,errors} (regenerate clashing ids)
// sound.ts
sound={unlock(),play(cue:"select"|"final"|"correct"|"wrong"|"lifeline"|"milestone"|"tick"|"win"|"bed-start"|"bed-stop"),setMuted,setVolume}  // oscillators only, lazy AudioContext, silent no-op fallback
// router
interface Screen { mount(root,ctx:AppContext,params?):()=>void }  ScreenId="menu"|"setup"|"game"|"results"|"editor"|"stats"|"settings"
```
Hash routing, `base:'./'`.

## 7. UI spec
- Theme: navy->purple radial gradient, gold/orange highlights; hexagonal answer/question boxes (clip-path) with connector lines. Answer states: idle, hover, selected(orange), correct(green), eliminated(blank); never colour alone.
- Ladder sidebar right; safe havens white/bold; current rung highlighted; drawer on narrow screens. `<ol>` with aria-current.
- hostBubble with scripted lines ("Is that your final answer?", milestone, walk-away, loss), toggleable. Final answer modal ("Final answer"/"Not yet") then suspense delay (revealDelayMs, longer at higher Qs).
- Menu: resume banner if save; TOP "Your Custom Games" cards (play/edit/duplicate/delete), New custom game, Import/Export; BELOW preset library sorted by episode (toggle episode/date), search by name+tag (debounced), edition filter, difficulty filter, Random set. Every bank badge: "Episode-style set: original questions inspired by the show's format, not broadcast questions." `date` labelled "Style era".
- Setup: toggles for built-in + custom lifelines, ladder preset (default Classic), timer mode, shuffle answers, Start.
- Editor: ordered question list (add/remove/reorder with buttons), ladder editor with presets, safe-haven checkboxes, spares, custom lifeline builder (name, icon, effect, params: remove-wrong n<=2, accuracy 0-1, seconds 5-120), inline validation.
- Keyboard: A-D/1-4 select, Enter final/confirm, Esc cancel, F 50:50, P phone, U audience, S switch, D double dip, W walk, L ladder, M mute, ? help; custom lifelines 5-9.
- A11y: real buttons, aria-live region, dialog role + focus trap/return, prefers-reduced-motion + settings override, AA contrast.
- Extras: Report-question button (local flagged ids included in export), history/stats dashboard (CSS bars), settings, PWA offline.

## 8. Work packages
Order: WP0 -> {WP1..WP16 parallel} -> WP17 -> WP18.
- WP0 Foundation: scaffold, lint/prettier, vitest+jsdom, playwright config, types.ts, dom.ts, router/context/main, stubs for everything in sec 3, tokens/base css; scripts: dev, build, preview, test, e2e, validate, manifest, typecheck (predev/prebuild -> manifest).
- WP1 Engine (rng, ladder, engine + tests). WP2 Lifelines (lifelines, simulate + tests). WP3 Data tooling (schema, bankLoader, build-manifest, validate-banks, fixtures in tests/fixtures, tests). WP4 Storage (+tests). WP5 Audio (+tests). WP6 Game screen + components + controller (rAF timer, autosave per transition, host lines). WP7 Menu+Setup. WP8 Editor. WP9 Results/Stats/Settings. WP10 Platform (keyboard.ts, a11y.ts, PWA in vite.config marked block, icons, CI/Pages workflows).
- WP11-16 Content: ep-001-009, 010-018, 019-027, 028-036, 037-045, 046-055 (55 banks).
- WP17 Integration + E2E + README. WP18 cross-agent fact-check (set reviewed:true).

### Content authoring brief
- Original questions in show style; never present as real broadcast; provenance "episode-style".
- Mixed themes per bank (geography, history, science, pop culture, language, sport, food, nature, arts); Q1-2 light/punny.
- Difficulty: Q1-5 -> 1-2, Q6-10 -> 3, Q11-13 -> 4, Q14-15 -> 5 (non-decreasing). Spares >=3: one each of diff 1-2, 3, 4-5.
- Stable well-documented facts only; avoid "current" holders/records/populations/prices/post-2023; no contested superlatives; exactly one defensible answer; plausible distractors; one-sentence explanation; if unsure drop it.
- Correct index spread evenly 0-3; no "all/none of the above".
- date: ascending plausible ISO dates 1999-2024; name "Set N: <theme hint>"; distinct seed topics per WP to reduce overlap.

## 9. Validation (`npm run validate` -> tsx scripts/validate-banks.ts, exit 1 on errors)
Errors: parse/schemaVersion; id != filename; duplicate id/episode; not 15 questions or <3 spares; answers !=4, empty/untrimmed/duplicate after normalisation; correct not 0-3; difficulty decreasing or outside tier band; duplicate question ids/text (within and across banks); transcribed without sources; non-ISO date.
Warnings: near-duplicates across banks (Jaccard>=0.8); answer text inside question; correct-index skew (>40% per bank, >30% global); text >200 / answers >60 chars; missing explanation.
Same validateBank runs in tests/unit/data/allBanks.test.ts.

## 10. Test plan
Unit (>=85% coverage core+storage): engine transitions, winnings at Q1/5/6/10/11/15, ladder lengths 1/12/20, Double Dip lockouts, switch exhaustion, shuffle remap, serialisation; lifelines never remove correct, polls sum 100, seeded determinism; storage corruption/quota/import; schema fixtures. Component (jsdom): hexAnswer, ladder aria-current, modal focus trap, keyboard. E2E (Playwright, dev-only `?seed=1&bank=fixture`): full win, wrong at Q7 -> $1,000, walk at Q12, each lifeline, clock timeout, custom game create/edit/play/export/import, resume, keyboard-only, mobile drawer, offline reload. CI: typecheck -> lint -> unit -> validate -> build -> e2e.

## 11. Risks
Factual errors (strict brief, explanations, WP18 cross-check, Report button); provenance/trademark (episode-style labels, disclaimer); parallel conflicts (frozen types + stubs + strict ownership); state complexity (pure reducer, exhaustive tests); WebAudio autoplay (unlock on gesture); storage drift (versioned keys, saves embed full questions); hexagon layout (clamp fonts, validator length warnings).

## 12. Success criteria
Classic game end-to-end; all 5 built-in + custom lifelines (7 effect types) toggleable per game; menu with custom games on top and searchable sorted library of >=50 validated banks; custom ladders/import-export; save/resume, history/stats, settings, mute, shortcuts, reduced motion, offline; validate+unit+e2e pass.
