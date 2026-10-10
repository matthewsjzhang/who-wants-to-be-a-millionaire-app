import './styles/tokens.css';
import './styles/base.css';
import { createRouter } from './app/router';
import { createContext } from './app/context';
import { menuScreen } from './ui/screens/menu';
import { setupScreen } from './ui/screens/setup';
import { gameScreen } from './ui/screens/game';
import { resultsScreen } from './ui/screens/results';
import { editorScreen } from './ui/screens/editor';
import { statsScreen } from './ui/screens/stats';
import { settingsScreen } from './ui/screens/settings';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const ctx = createContext({ navigate: (id, params) => router.navigate(id, params) });
const router = createRouter(root, () => ctx);

router.register('menu', menuScreen);
router.register('setup', setupScreen);
router.register('game', gameScreen);
router.register('results', resultsScreen);
router.register('editor', editorScreen);
router.register('stats', statsScreen);
router.register('settings', settingsScreen);

router.start();
