import React from 'react';
import { motion } from 'motion/react';

interface BrutalistLoaderProps {
  text?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  theme?: 'dark' | 'light';
}

export const BrutalistLoader: React.FC<BrutalistLoaderProps> = ({ 
  text = "Synchronizing", 
  className = "py-20",
  size = 'md',
  theme = 'light'
}) => {
  const containerSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12';
  const squareSize = size === 'sm' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
  const travel = size === 'sm' ? 22 : size === 'lg' ? 40 : 32;

  const borderColor = theme === 'dark' ? 'border-white' : 'border-[#141414]';
  const squareColor = theme === 'dark' ? 'bg-white' : 'bg-[#141414]';
  const textColor = theme === 'dark' ? 'text-white' : 'text-[#141414]';

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`${containerSize} relative border-b-4 border-r-4 ${borderColor} ${text ? 'mb-4' : ''}`}>
        <motion.div 
          className={`${squareSize} ${squareColor} absolute`}
          initial={{ x: 0, y: travel }}
          animate={{ 
            x: [0, travel, travel, 0],
            y: [travel, travel, 0, travel],
            opacity: [1, 1, 1, 0]
          }}
          transition={{ 
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.4, 0.8, 1]
          }}
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
