import 'uno.css';
import { render } from 'solid-js/web';
import 'solid-devtools';

import App from './App';
import { assert } from './utils';

const root = document.getElementById('root');

if (import.meta.env.DEV) {
  assert(
    root instanceof HTMLElement,
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => <App />, root!);
