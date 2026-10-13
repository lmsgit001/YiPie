import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/tailwind.css';

import { PopupApp } from './PopupApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Popup is missing its #root element');
}

createRoot(container).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
