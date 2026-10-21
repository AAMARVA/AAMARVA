import React, { useMemo, useState, useEffect, useContext } from 'react';
import { getRobohashAvatarUrl, normalizeAvatarUrl } from '../lib/robohash';
import { AuthContext } from '../context/AuthContext';
import { isSlaveAccount } from '../services/authApi';

/**
 * Returns the authoritative brutalist custom initial avatar SVG
 * generated for master accounts at registration.
 */
export function getMasterCustomAvatarSvg(name?: string, id?: string): string {
  const cleanName = (name || id || 'M').trim().replace(/^@/, '');
  const initial = (cleanName.charAt(0) || 'M').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#141414"/><text x="50%" y="54%" font-family="monospace" font-size="56" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
  isMaster?: boolean;
  isSlave?: boolean;
  accountType?: 'master' | 'slave';
}

export const AgentAvatar: React.FC<AgentAvatarProps> = React.memo(({
  avatar,
  name = 'Agent',
  id,
  className = 'w-10 h-10',
  isMaster,
  isSlave,
  accountType,
}) => {
  // Access auth context gracefully if mounted inside AuthProvider
  const auth = useContext(AuthContext);
  const currentUser = auth?.user;
  const isCurrentMaster = currentUser ? !isSlaveAccount(currentUser) : false;

  // Clean identifier seed (e.g. '@kd' -> 'kd', 'AMR-ZQWT-TSH6' -> 'amr-zqwt-tsh6')
  const canonicalSeed = useMemo(() => {
    let rawSeed = (id || name || 'agent').trim();
    if (rawSeed.startsWith('@')) {
      rawSeed = rawSeed.substring(1);
    }
    return rawSeed.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'agent';
  }, [id, name]);

  const cleanInitial = useMemo(() => {
    const raw = (name || id || 'M').trim().replace(/^@/, '');
    return (raw.charAt(0) || 'M').toUpperCase();
  }, [name, id]);

  // Determine whether this account is a Master account (which must NEVER show RoboHash)
  const isMasterAccount = useMemo(() => {
    if (isMaster === true) return true;
    if (isMaster === false || isSlave === true || accountType === 'slave') return false;
    if (accountType === 'master') return true;

    // Check if matches the active logged-in master user
    if (isCurrentMaster && currentUser) {
      const cId = String(currentUser.id || '').toLowerCase();
      const cAid = String(currentUser.agentId || '').toLowerCase().replace(/^@/, '');
      const cName = String(currentUser.name || '').toLowerCase();
      const targetId = String(id || '').toLowerCase().replace(/^@/, '');
      const targetName = String(name || '').toLowerCase();

      if (targetId && (targetId === cId || targetId === cAid)) return true;
      if (targetName && targetName === cName) return true;
    }

    const lowerName = String(name || '').toLowerCase();
    const lowerId = String(id || '').toLowerCase();
    if (lowerName.includes('master') || lowerId.includes('master')) return true;

    return false;
  }, [isMaster, isSlave, accountType, isCurrentMaster, currentUser, id, name]);

  const isEmojiOrText = useMemo(() => {
    if (!avatar || typeof avatar !== 'string') return false;
    const trimmed = avatar.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:')
    ) {
      return false;
    }
    // If it's a generic robot emoji and this is a master account, do NOT treat as custom avatar
    if (isMasterAccount && (trimmed === '🤖' || trimmed === '👾')) {
      return false;
    }
    return true;
  }, [avatar, isMasterAccount]);

  const defaultRobohashUrl = useMemo(() => {
    return getRobohashAvatarUrl(canonicalSeed, '150x150');
  }, [canonicalSeed]);

  const initialUrl = useMemo(() => {
    // ALWAYS respect custom uploaded avatar if provided (data URI, http/https URL, or path)
    if (avatar && typeof avatar === 'string' && avatar.trim().length > 0) {
      const trimmed = avatar.trim();
      const isGenericEmoji = trimmed === '🤖' || trimmed === '👾';
      if (!isGenericEmoji && (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/'))) {
        return trimmed;
      }
    }

    // Check current logged-in user custom avatar
    if (currentUser?.avatar && typeof currentUser.avatar === 'string') {
      const uAv = currentUser.avatar.trim();
      const isGenericEmoji = uAv === '🤖' || uAv === '👾';
      if (!isGenericEmoji && (uAv.startsWith('data:') || uAv.startsWith('http://') || uAv.startsWith('https://') || uAv.startsWith('/'))) {
        return uAv;
      }
    }

    if (isMasterAccount) {
      // Generate the exact custom avatar SVG created for this account at registration
      return getMasterCustomAvatarSvg(name, id);
    }

    // Non-master account default fallback to Robohash
    return defaultRobohashUrl;
  }, [avatar, canonicalSeed, defaultRobohashUrl, isMasterAccount, isCurrentMaster, currentUser, name, id]);

  const [currentSrc, setCurrentSrc] = useState(initialUrl);
  const [imgFailed, setImgFailed] = useState(false);

  // Sync state if avatar or seed changes
  useEffect(() => {
    setCurrentSrc(initialUrl);
    setImgFailed(false);
  }, [initialUrl]);

  const handleImgError = () => {
    // If master account image fails, fallback to custom SVG avatar
    if (isMasterAccount) {
      setCurrentSrc(getMasterCustomAvatarSvg(name, id));
    }
    setImgFailed(true);
  };

  if (isEmojiOrText && avatar && (!isMasterAccount || (avatar.trim() !== '🤖' && avatar.trim() !== '👾'))) {
    return (
      <div
        className={`relative bg-[#D6D4D0] border border-[#141414] text-[#141414] flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
      >
        <span className="text-sm sm:text-base leading-none select-none flex items-center justify-center w-full h-full">
          {avatar.trim()}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-[#141414] border border-[#141414] text-white flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
    >
      {imgFailed && !isMasterAccount ? (
        <div className="w-full h-full flex items-center justify-center font-black text-xs sm:text-sm uppercase tracking-tighter bg-[#E4E3E0] text-[#141414] select-none">
          {canonicalSeed.slice(0, 2).toUpperCase() || '🤖'}
        </div>
      ) : imgFailed && isMasterAccount ? (
        <div className="w-full h-full flex items-center justify-center font-black text-xs sm:text-sm uppercase tracking-tighter bg-[#141414] text-white select-none">
          {cleanInitial}
        </div>
      ) : (
        <img
          src={currentSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleImgError}
          className="w-full h-full object-cover bg-transparent relative z-10 block"
        />
      )}
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';
