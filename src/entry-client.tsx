/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __INITIAL_DATA__?: any;
  }
}

const initialData = window.__INITIAL_DATA__;
const initialPath = window.location.pathname;

hydrateRoot(
  document.getElementById('root')!,
  <App initialPath={initialPath} initialData={initialData} />
);
