// WP7: main menu - resume banner, custom games (top), preset library (below).
import '../../styles/menu.css';
import type {
  AppContext,
  BankMeta,
  CustomGame,
  Difficulty,
  Edition,
  Screen,
  ScreenParams,
} from '../../core/types';
import { h, clear } from '../dom';
import { listBanks, randomBank } from '../../data/bankLoader';
import { listCustomGames, upsertCustomGame, deleteCustomGame } from '../../storage/customGames';
import { exportJSON, importJSON } from '../../storage/io';
import { loadSavedGame, clearSavedGame } from '../../storage/savegame';

export type SortKey = 'episode' | 'date';
export type SortDir = 'asc' | 'desc';

export interface LibraryFilter {
  query: string;
  edition: Edition | '';
  difficulty: Difficulty | 0;
  sort: SortKey;
  dir: SortDir;
}

export const EPISODE_STYLE_NOTE =
  "Episode-style set: original questions inspired by the show's format, not broadcast questions.";

/** Pure filter + sort used by the library view (exported for tests). */
export function filterBanks(banks: BankMeta[], f: LibraryFilter): BankMeta[] {
  const q = f.query.trim().toLowerCase();
  const out = banks.filter((b) => {
    if (q && !(b.name.toLowerCase().includes(q) || b.tags.some((t) => t.toLowerCase().includes(q))))
      return false;
    if (f.edition && b.edition !== f.edition) return false;
    if (f.difficulty && !b.difficulties.includes(f.difficulty)) return false;
    return true;
  });
  const sign = f.dir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    const primary = f.sort === 'date' ? a.date.localeCompare(b.date) : a.episode - b.episode;
    return sign * (primary || a.episode - b.episode);
  });
  return out;
}

function newId(): string {
  return 'cg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function duplicateGame(g: CustomGame): CustomGame {
  const now = new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(g)) as CustomGame;
  return { ...copy, id: newId(), name: `${g.name} (copy)`, createdAt: now, updatedAt: now };
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const menuScreen: Screen = {
  mount(root: HTMLElement, ctx: AppContext, _params?: ScreenParams): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const filter: LibraryFilter = {
      query: '',
      edition: '',
      difficulty: 0,
      sort: 'episode',
      dir: 'asc',
    };

    const status = h('p', { class: 'menu-status', role: 'status' });
    const setStatus = (msg: string): void => {
      status.textContent = msg;
      if (msg) ctx.announce(msg);
    };

    // ---- Resume banner
    const resumeBox = h('div', { class: 'menu-resume-slot' });
    function renderResume(): void {
      clear(resumeBox);
      const saved = loadSavedGame();
      if (!saved) return;
      const qn = saved.qIndex + 1;
      resumeBox.appendChild(
        h(
          'section',
          { class: 'menu-resume', 'aria-label': 'Saved game' },
          h('p', null, `You have a saved game in progress (question ${qn}).`),
          h(
            'div',
            { class: 'menu-row' },
            h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                id: 'resume-btn',
                onclick: () => ctx.navigate('game', { resume: true }),
              },
              'Resume game',
            ),
            h(
              'button',
              {
                class: 'btn',
                type: 'button',
                id: 'discard-btn',
                onclick: () => {
                  clearSavedGame();
                  renderResume();
                },
              },
              'Discard',
            ),
          ),
        ),
      );
    }

    // ---- Custom games
    const customList = h('ul', { class: 'card-list', 'aria-label': 'Your custom games' });
    function actionBtn(act: string, label: string, g: CustomGame, fn: () => void, cls = 'btn') {
      return h(
        'button',
        { class: cls, type: 'button', 'data-act': act, 'aria-label': `${label} ${g.name}`, onclick: fn },
        label,
      );
    }
    function renderCustom(): void {
      clear(customList);
      const games = listCustomGames();
      if (!games.length) {
        customList.appendChild(
          h('li', { class: 'empty' }, 'No custom games yet. Create one to write your own questions!'),
        );
        return;
      }
      for (const g of games) {
        const n = g.questions.length;
        customList.appendChild(
          h(
            'li',
            { class: 'card custom-card', dataset: { gameId: g.id } },
            h('h3', null, g.name),
            h('p', { class: 'meta' }, `${n} question${n === 1 ? '' : 's'}`),
            h(
              'div',
              { class: 'menu-row' },
              actionBtn(
                'play',
                'Play',
                g,
                () => ctx.navigate('setup', { customGameId: g.id }),
                'btn btn-primary',
              ),
              actionBtn('edit', 'Edit', g, () => ctx.navigate('editor', { editId: g.id })),
              actionBtn('duplicate', 'Duplicate', g, () => {
                upsertCustomGame(duplicateGame(g));
                renderCustom();
                setStatus(`Duplicated ${g.name}`);
              }),
              actionBtn(
                'delete',
                'Delete',
                g,
                () => {
                  if (window.confirm(`Delete "${g.name}"? This cannot be undone.`)) {
                    deleteCustomGame(g.id);
                    renderCustom();
                    setStatus(`Deleted ${g.name}`);
                  }
                },
                'btn btn-danger',
              ),
            ),
          ),
        );
      }
    }

    const fileInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      class: 'sr-only',
      tabindex: '-1',
      'aria-label': 'Import file',
    }) as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        if (disposed) return;
        try {
          const res = importJSON(text);
          renderCustom();
          setStatus(
            res.errors.length
              ? `Imported ${res.imported}. Problems: ${res.errors.join('; ')}`
              : `Imported ${res.imported} game${res.imported === 1 ? '' : 's'}.`,
          );
        } catch (e) {
          setStatus(`Import failed: ${(e as Error).message}`);
        }
        fileInput.value = '';
      });
    });

    function doExport(): void {
      try {
        download('millionaire-custom.json', exportJSON());
        setStatus('Exported custom games.');
      } catch (e) {
        setStatus(`Export failed: ${(e as Error).message}`);
      }
    }

    // ---- Library
    const libList = h('ul', { class: 'card-list lib-list', 'aria-label': 'Question sets' });
    const libCount = h('p', { class: 'meta' });
    let banks: BankMeta[] = [];
    try {
      banks = listBanks();
    } catch {
      banks = [];
    }
    function renderLibrary(): void {
      clear(libList);
      const shown = filterBanks(banks, filter);
      libCount.textContent = `${shown.length} of ${banks.length} sets`;
      if (!shown.length)
        libList.appendChild(h('li', { class: 'empty' }, 'No sets match your filters.'));
      for (const b of shown) {
        libList.appendChild(
          h(
            'li',
            { class: 'card bank-card', dataset: { bankId: b.id } },
            h('h3', null, h('span', { class: 'ep' }, `#${b.episode}`), ' ', b.name),
            h('p', { class: 'meta' }, `${b.edition} edition · Style era ${b.date}`),
            b.tags.length
              ? h(
                  'p',
                  { class: 'tags' },
                  b.tags.map((t) => h('span', { class: 'tag' }, t)),
                )
              : null,
            h(
              'p',
              { class: 'badge' },
              b.provenance === 'episode-style' ? EPISODE_STYLE_NOTE : 'Transcribed set',
            ),
            h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                'aria-label': `Play ${b.name}`,
                onclick: () => ctx.navigate('setup', { bankId: b.id }),
              },
              'Play',
            ),
          ),
        );
      }
    }

    const search = h('input', {
      type: 'search',
      id: 'lib-search',
      placeholder: 'Name or tag',
      autocomplete: 'off',
    }) as HTMLInputElement;
    search.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        filter.query = search.value;
        renderLibrary();
      }, 200);
    });
    const edition = h(
      'select',
      { id: 'lib-edition' },
      h('option', { value: '' }, 'All editions'),
      ...(['US', 'UK', 'AU', 'INT'] as Edition[]).map((e) => h('option', { value: e }, e)),
    ) as HTMLSelectElement;
    edition.addEventListener('change', () => {
      filter.edition = edition.value as Edition | '';
      renderLibrary();
    });
    const diff = h(
      'select',
      { id: 'lib-difficulty' },
      h('option', { value: '0' }, 'Any difficulty'),
      ...[1, 2, 3, 4, 5].map((d) => h('option', { value: String(d) }, `Level ${d}`)),
    ) as HTMLSelectElement;
    diff.addEventListener('change', () => {
      filter.difficulty = Number(diff.value) as Difficulty | 0;
      renderLibrary();
    });
    const sortSel = h(
      'select',
      { id: 'lib-sort' },
      h('option', { value: 'episode' }, 'Episode'),
      h('option', { value: 'date' }, 'Style era (date)'),
    ) as HTMLSelectElement;
    sortSel.addEventListener('change', () => {
      filter.sort = sortSel.value as SortKey;
      renderLibrary();
    });
    const dirBtn = h(
      'button',
      { class: 'btn', type: 'button', id: 'lib-dir', 'aria-label': 'Sort ascending' },
      'Ascending',
    ) as HTMLButtonElement;
    dirBtn.addEventListener('click', () => {
      filter.dir = filter.dir === 'asc' ? 'desc' : 'asc';
      dirBtn.textContent = filter.dir === 'asc' ? 'Ascending' : 'Descending';
      dirBtn.setAttribute('aria-label', filter.dir === 'asc' ? 'Sort ascending' : 'Sort descending');
      renderLibrary();
    });
    const randomBtn = h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        id: 'lib-random',
        onclick: () => {
          try {
            const pick = randomBank({
              edition: filter.edition || undefined,
              difficulty: filter.difficulty || undefined,
              query: filter.query.trim() || undefined,
            });
            ctx.navigate('setup', { bankId: pick.id });
          } catch {
            setStatus('No set available to pick.');
          }
        },
      },
      'Random set',
    );

    const field = (label: string, id: string, control: Node): HTMLElement =>
      h('div', { class: 'field' }, h('label', { for: id }, label), control);

    const el = h(
      'main',
      { class: 'screen screen-menu' },
      h(
        'header',
        { class: 'menu-hero' },
        h('h1', null, 'Millionaire Quiz'),
        h('p', { class: 'tagline' }, 'Fifteen questions. Three lifelines. One million.'),
        h(
          'nav',
          { class: 'menu-row', 'aria-label': 'More' },
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.navigate('stats') }, 'Stats'),
          h(
            'button',
            { class: 'btn', type: 'button', onclick: () => ctx.navigate('settings') },
            'Settings',
          ),
        ),
      ),
      resumeBox,
      status,
      h(
        'section',
        { class: 'menu-section', 'aria-labelledby': 'custom-h' },
        h('h2', { id: 'custom-h' }, 'Your Custom Games'),
        h(
          'div',
          { class: 'menu-row' },
          h(
            'button',
            {
              class: 'btn btn-primary',
              type: 'button',
              id: 'new-custom',
              onclick: () => ctx.navigate('editor'),
            },
            'New custom game',
          ),
          h(
            'button',
            { class: 'btn', type: 'button', id: 'import-btn', onclick: () => fileInput.click() },
            'Import',
          ),
          h('button', { class: 'btn', type: 'button', id: 'export-btn', onclick: doExport }, 'Export'),
          fileInput,
        ),
        customList,
      ),
      h(
        'section',
        { class: 'menu-section', 'aria-labelledby': 'lib-h' },
        h('h2', { id: 'lib-h' }, 'Question Library'),
        h(
          'div',
          { class: 'lib-controls' },
          field('Search', 'lib-search', search),
          field('Edition', 'lib-edition', edition),
          field('Difficulty', 'lib-difficulty', diff),
          field('Sort by', 'lib-sort', sortSel),
          h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Order'), dirBtn),
          h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Surprise me'), randomBtn),
        ),
        libCount,
        libList,
      ),
    );

    renderResume();
    renderCustom();
    renderLibrary();
    root.appendChild(el);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      el.remove();
    };
  },
};
