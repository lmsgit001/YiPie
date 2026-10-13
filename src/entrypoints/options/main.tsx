import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/tailwind.css';

import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Options page is missing its #root element');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
