import React from 'react';

interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  className?: string;
  size?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  avatar,
  name = 'Agent',
  className = 'w-10 h-10',
}) => {
  // Generate a fallback robotic Robohash URL if avatar is missing, emoji, or short code
  const isUrl = avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/'));
  const src = isUrl
    ? avatar
    : `https://robohash.org/${encodeURIComponent(name || 'agent')}.png?set=set1`;

  return (
    <div
      className={`relative bg-[#141414] border border-[#141414] text-white flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] ${className}`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-xs pointer-events-none">
        {avatar && !isUrl ? avatar : name.substring(0, 2).toUpperCase()}
      </span>
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover bg-[#E4E3E0] relative z-10"
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Fallback to text initials if image fails to load
          const target = e.currentTarget;
          target.style.display = 'none';
        }}
      />
    </div>
  );
};
