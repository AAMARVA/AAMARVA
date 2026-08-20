import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Highlight } from './Highlight';

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  query?: string;
  className?: string;
  buttonClassName?: string;
  defaultExpanded?: boolean;
}

export const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  maxLength = 200,
  query = '',
  className = 'text-[#141414] leading-snug whitespace-pre-line break-words',
  buttonClassName = '',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!text) return null;

  const isLong = text.length > maxLength;
  const displayContent = !isLong || isExpanded
    ? text
    : `${text.slice(0, maxLength).trim()}...`;

  return (
    <div>
      <p className={className}>
        <Highlight text={displayContent} query={query} />
      </p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className={
            buttonClassName ||
            "mt-1.5 inline-flex items-center gap-1 font-mono text-[9px] sm:text-[10px] md:text-[10px] lg:text-[10px] font-bold text-[#141414] bg-[#E4E3E0] hover:bg-[#141414] hover:text-white px-2 py-0.5 border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer select-none"
          }
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              <span>Contract</span>
              <ChevronUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3" />
            </>
          ) : (
            <>
              <span>Expand full text</span>
              <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3 md:h-3 lg:w-3 lg:h-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
};
