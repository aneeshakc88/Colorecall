import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import Terms from './pages/Terms.tsx';
import Privacy from './pages/Privacy.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
