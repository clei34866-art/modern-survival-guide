import { render } from 'preact';
import { App } from './App';
import './styles/tokens-living.css';
import './styles/tokens-wall.css';

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
