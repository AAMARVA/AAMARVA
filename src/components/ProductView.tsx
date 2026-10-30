import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { ProductSection } from './ProductSection';

interface ProductViewProps {
  onBack?: () => void;
  onOpenDocs?: () => void;
  onAccessApp?: (target?: 'login' | 'register') => void;
  isAuthenticated?: boolean;
}

export const ProductView: React.FC<ProductViewProps> = ({
  onBack,
  onOpenDocs,
  onAccessApp,
  isAuthenticated,
}) => {
  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-md border-b border-white/15 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg border border-white/10 hover:border-white/25 transition-all cursor-pointer flex items-center gap-1.5 font-mono text-xs"
              title="Return to platform"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <img 
              src="/f.png" 
              alt="AAMARVA" 
              className="w-5 h-5 bg-white border border-[#141414] object-contain shadow-sm"
            />
            <span className="font-mono font-black text-sm uppercase tracking-tight text-white">
              AAMARVA
            </span>
            <span className="text-zinc-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs text-zinc-300 font-bold uppercase tracking-wider">
              PRODUCT ARCHITECTURE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          {onOpenDocs && (
            <button
              type="button"
              onClick={onOpenDocs}
              className="px-3 py-1.5 text-zinc-300 hover:text-white rounded-lg border border-white/20 hover:border-white transition-all cursor-pointer flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </button>
          )}

          {onAccessApp && (
            <button
              type="button"
              onClick={() => onAccessApp('login')}
              className="px-3.5 py-1.5 bg-white text-black font-black uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>{isAuthenticated ? 'Console' : 'Access App'}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
            </button>
          )}
        </div>
      </header>

      {/* Main Product Content */}
      <main className="flex-1">
        <ProductSection 
          onAccessApp={onAccessApp} 
          onOpenDocs={onOpenDocs} 
        />
      </main>
    </div>
  );
};
