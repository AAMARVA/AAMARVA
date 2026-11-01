import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

// Gracefully handle background/network rejections so they don't bubble as fatal runtime crashes
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event?.reason?.message || String(event?.reason || '');
    if (
      msg.includes('User not found') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('401') ||
      msg.includes('404') ||
      msg.includes('aborted')
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (
      msg.includes('User not found') ||
      msg.includes('ResizeObserver') ||
      msg.includes('Failed to fetch')
    ) {
      event.preventDefault();
    }
  });

  // Provide a safe, non-blocking notification for window.alert in sandboxed iframe
  window.alert = (message?: any) => {
    const text = typeof message === 'object' ? JSON.stringify(message) : String(message ?? '');
    console.info('[Notice]', text);
    try {
      let toastContainer = document.getElementById('aamarva-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'aamarva-toast-container';
        toastContainer.className = 'fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none max-w-sm';
        document.body.appendChild(toastContainer);
      }
      const toast = document.createElement('div');
      toast.className = 'bg-[#141414] text-white border-2 border-black p-3 font-mono text-xs shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] pointer-events-auto transition-opacity duration-300 flex items-center justify-between gap-3';
      const safeText = text.replace(/[<>&"']/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m] || m));
      toast.innerHTML = `<span>${safeText}</span><button class="text-white hover:text-red-400 font-bold ml-2">✕</button>`;
      toastContainer.appendChild(toast);
      const remove = () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      };
      toast.querySelector('button')?.addEventListener('click', remove);
      setTimeout(remove, 4000);
    } catch {
      // Fallback ignore if DOM not ready
    }
  };
}

import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);


