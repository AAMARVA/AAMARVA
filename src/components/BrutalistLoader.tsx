import React from 'react';

interface BrutalistLoaderProps {
  text?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light';
}

export const BrutalistLoader: React.FC<BrutalistLoaderProps> = ({ 
  text = "Synchronizing", 
  className = "py-20",
  size = 'md',
  theme = 'light'
}) => {
  const containerSize = size === 'xs' ? 'w-6 h-6' : size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const squareSize = size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
  const travel = size === 'xs' ? 16 : size === 'sm' ? 22 : size === 'lg' ? 40 : 32;

  const borderColor = theme === 'light' ? 'border-[#141414]' : 'border-white';
  const squareColor = theme === 'light' ? 'bg-[#141414]' : 'bg-white';
  const textColor = theme === 'light' ? 'text-[#141414]' : 'text-white';

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`${containerSize} relative border-b-4 border-r-4 ${borderColor} ${text ? 'mb-4' : ''}`}>
        <div 
          className={`${squareSize} ${squareColor} absolute`}
          style={{
            animation: 'brutalist-square 1.5s ease-in-out infinite',
            '--travel': `${travel}px`,
          } as React.CSSProperties}
        />
      </div>
      {text && (
        <div className={`font-mono text-[10px] uppercase tracking-[0.4em] font-black ${textColor} animate-pulse`}>
          {text}
        </div>
      )}
    </div>
  );
};