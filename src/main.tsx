import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './AsyncGalleryApp.tsx';
import './index.css';
import {ThemeProvider} from './theme.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
