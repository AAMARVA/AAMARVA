import React from 'react';

export const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query || query.trim() === '') return <>{text}</>;
  
  // Escape special regex characters in query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, index) =>
        new RegExp(escapedQuery, 'gi').test(part) ? (
          <span key={index} className="bg-gray-200 text-black rounded-sm px-0.5">{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};
