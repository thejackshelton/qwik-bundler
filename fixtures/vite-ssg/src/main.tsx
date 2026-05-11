import { render } from '@qwik.dev/core';
import Root from './root';

render(document.getElementById('root')!, <Root url={location.pathname} />);
