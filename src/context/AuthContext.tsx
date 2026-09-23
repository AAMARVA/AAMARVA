import React, { createContext, useContext, useState, useEffect } from 'react';
import { WebAuthnEnableModal } from '../components/WebAuthnEnableModal';
import { WebAuthnVerifyModal } from '../components/WebAuthnVerifyModal';
import {
  UserProfile,
  registerUserApi,
  loginUserApi,
  loginAgentApi,
  logoutUserApi,
  fetchCurrentProfileApi,
  setAccessToken,
  getAccessToken,
  deleteAccountApi,
  updateProfileApi,
  apiFetch,
  AuthType,
} from '../services/authApi';
import { 
  generateAgentCryptoIdentity, 
  deriveAgentCryptoIdentity, 
  rotateAgentCryptoIdentity, 
  generateIdentitySigningKeyPair,
  signKeyBinding,
  computeKeyFingerprint,
  getLocalKeyPair, 
  saveLocalKeyPair 
} from '../lib/e2ee';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  userPassword?: string | null;
  updatePassword?: (pwd: string) => void;
  login: (agentId: string, credential: string) => Promise<void>;
  loginAgent: (agentId: string, apiKey: string) => Promise<void>;
  register: (email: string, password: string, agentName?: string, bio?: string) => Promise<{ agentId: string; apiKey: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  rotateE2EEKeys?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('aamarva_user');
        if (stored && stored !== 'undefined') {
          return JSON.parse(stored);
        }
      } catch (err) {
        console.warn('Failed to parse aamarva_user from localStorage:', err);
        localStorage.removeItem('aamarva_user');
      }
    }
    return null;
  });
  const [userPassword, setUserPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [webAuthnPrompt, setWebAuthnPrompt] = useState<{
    pendingToken: string;
    options: any;
    userName?: string;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const [webAuthnVerifyPrompt, setWebAuthnVerifyPrompt] = useState<{
    pendingToken: string;
    options: any;
    userName?: string;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  } | null>(null);

  
  const ensureE2EEKeys = async (agentId: string, forceRotate: boolean = false, credential?: string) => {
    if (typeof window === 'undefined' || !agentId) return;
    try {
      const activeCredential = credential || userPassword;
      // Fetch current server profile to get registered public key and fingerprint
      const profile = await fetchCurrentProfileApi().catch(() => null);
      const serverFp = profile?.e2eePublicKeyFingerprint || user?.e2eePublicKeyFingerprint || null;
      const serverKeyEpoch = profile?.e2eeKeyEpoch || user?.e2eeKeyEpoch || 1;

      // 1. Load existing local key pair
      let keys = await getLocalKeyPair(agentId, undefined, activeCredential || undefined);
      let localFp = keys?.fingerprint || (keys?.publicKey ? await computeKeyFingerprint(keys.publicKey) : null);

      // Report non-sensitive comparison metadata
      console.log('E2EE_KEY_SYNC_CHECK', {
        localPublicKeyFingerprint: localFp,
        serverPublicKeyFingerprint: serverFp,
        match: !!localFp && !!serverFp && localFp === serverFp,
        keyEpoch: keys?.keyEpoch || serverKeyEpoch || 1
      });

      const publishKey = async (keyEntry: any, allowRotation: boolean) => {
        const isAgentToken = typeof window !== 'undefined' && !!getAccessToken();
        const authType: AuthType = isAgentToken ? 'agent' : 'human';
        const headers: Record<string, string> = {};
        if (!isAgentToken && user?.apiKey) {
          headers['x-api-key'] = user.apiKey;
        }

        await apiFetch('/api/agents/me/e2ee', {
          method: 'PUT',
          authType,
          headers,
          body: JSON.stringify({
            publicKey: keyEntry.publicKey,
            fingerprint: keyEntry.fingerprint,
            identityKey: keyEntry.identityPublicKey,
            signature: keyEntry.signature,
            keyEpoch: keyEntry.keyEpoch || 1,
            allowRotation
          })
        });
      };

      if (forceRotate) {
        console.log('Performing explicit authorized key rotation for agent:', agentId);
        const nextEpoch = Math.max(serverKeyEpoch, keys?.keyEpoch || 1);
        const rotated = await rotateAgentCryptoIdentity(agentId, nextEpoch);
        await publishKey(rotated, true);
        return;
      }

      if (keys && keys.publicKey && keys.privateKey) {
        if (serverFp && localFp === serverFp) {
          // (d) Keys match! Continue normally.
          if (!keys.identityPublicKey || !keys.signature || !keys.identityPrivateKey) {
            const idSign = await generateIdentitySigningKeyPair();
            const fp = keys.fingerprint || (await computeKeyFingerprint(keys.publicKey));
            const signature = await signKeyBinding(idSign.identityPrivateKey, agentId, fp);
            await saveLocalKeyPair(
              agentId,
              keys.publicKey,
              keys.privateKey,
              fp,
              idSign.identityPublicKey,
              idSign.identityPrivateKey,
              signature,
              keys.keyEpoch || 1
            );
          }
          return;
        }

        if (!serverFp) {
          // (e) Server has no public key: publish local public key
          await publishKey(keys, false);
          return;
        }

        if (serverFp && localFp !== serverFp) {
          // (f) Server has a public key but local key does NOT match!
          // Perform authorized key rotation to establish synchronized key pair.
          console.warn('E2EE_KEY_MISMATCH_DETECTED: Local key does not match server registered key. Initiating authorized key rotation.');
          const nextEpoch = Math.max(serverKeyEpoch, keys.keyEpoch || 1);
          const rotated = await rotateAgentCryptoIdentity(agentId, nextEpoch);
          await publishKey(rotated, true);
          return;
        }
      } else {
        // No local key pair exists
        if (!serverFp) {
          console.log('Establishing fresh cryptographic identity for agent:', agentId);
          const identity = activeCredential 
            ? await deriveAgentCryptoIdentity(agentId, activeCredential)
            : await generateAgentCryptoIdentity(agentId);

          await saveLocalKeyPair(
            agentId,
            identity.e2eePublicKey,
            identity.e2eePrivateKey,
            identity.fingerprint,
            identity.identityPublicKey,
            identity.identityPrivateKey,
            identity.signature,
            identity.keyEpoch || 1
          );
          await publishKey(identity, false);
        } else {
          // Server has a key, but client has no local key
          let derivedMatch = false;
          const candidateCredentials = Array.from(new Set([
            credential,
            userPassword,
            user?.apiKey,
            profile?.apiKey,
            getAccessToken()
          ].filter(Boolean))) as string[];

          for (const cand of candidateCredentials) {
            try {
              const derived = await deriveAgentCryptoIdentity(agentId, cand, serverKeyEpoch);
              if (derived.fingerprint === serverFp) {
                await saveLocalKeyPair(
                  agentId,
                  derived.e2eePublicKey,
                  derived.e2eePrivateKey,
                  derived.fingerprint,
                  derived.identityPublicKey,
                  derived.identityPrivateKey,
                  derived.signature,
                  derived.keyEpoch
                );
                derivedMatch = true;
                break;
              }
            } catch (dErr) {}
          }

          if (!derivedMatch) {
            console.warn('E2EE_LOCAL_KEY_MISSING: Cannot recover private key for server public key. Authorizing key rotation.');
            const rotated = await rotateAgentCryptoIdentity(agentId, serverKeyEpoch);
            await publishKey(rotated, true);
          }
        }
      }
    } catch (e: any) {
      console.warn('E2EE Key initialization notice:', e?.message || e);
    }
  };

  const rotateE2EEKeys = async () => {
    if (!user?.agentId) throw new Error('No authenticated agent.');
    await ensureE2EEKeys(user.agentId, true);
    await refreshProfile();
  };

  const refreshProfile = async () => {
    try {
      const profile = await fetchCurrentProfileApi();
      if (profile) {
        setUser(profile);
        ensureE2EEKeys(profile.agentId);
        if (typeof window !== 'undefined') {
          localStorage.setItem('aamarva_user', JSON.stringify(profile));
        }
      }
    } catch (err: any) {
      // If unauthorized, the auth-unauthorized event will handle logout
      console.warn('Profile sync failed:', err?.message || err);
    }
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('Unauthorized token or deleted user detected. Logging out.');
      setUser(null);
      setUserPassword(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aamarva_user');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth-unauthorized', handleUnauthorized);
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'aamarva_user') {
        if (e.newValue) {
          try {
            setUser(JSON.parse(e.newValue));
          } catch (err) {
            console.warn('Failed to sync user from storage:', err);
          }
        } else {
          setUser(null);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

    const initAuth = async () => {
      // Attempt silent profile restoration via HttpOnly cookie or localStorage token
      try {
        await refreshProfile();
      } catch (e) {}

      // Recover and register local E2EE key pair for current authenticated account if present
      const storedUser = (() => {
        try {
          const raw = typeof window !== 'undefined' ? localStorage.getItem('aamarva_user') : null;
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
      const targetAgentId = storedUser?.agentId || user?.agentId;
      if (targetAgentId) {
        ensureE2EEKeys(targetAgentId);
      }

      setIsLoading(false);
    };

    initAuth();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth-unauthorized', handleUnauthorized);
        window.removeEventListener('storage', handleStorageChange);
      }
    };
  }, []);

  const login = async (agentId: string, credential: string) => {
    const result = await loginUserApi({ agentId, password: credential });
    let userToSave = null;

    if (result?.requiresWebAuthnSetup) {
      // Password credentials verified! Prompt popup modal to enable WebAuthn passkey before issuing session.
      userToSave = await new Promise((resolve, reject) => {
        setWebAuthnPrompt({
          pendingToken: result.pendingToken,
          options: result.options,
          userName: result.user?.name || result.user?.agentId || 'User',
          resolve,
          reject,
        });
      });
    } else if (result?.requiresWebAuthnVerify) {
      // Password credentials verified! Prompt popup modal to verify existing WebAuthn passkey.
      userToSave = await new Promise((resolve, reject) => {
        setWebAuthnVerifyPrompt({
          pendingToken: result.pendingToken,
          options: result.options,
          userName: result.user?.name || result.user?.agentId || 'User',
          resolve,
          reject,
        });
      });
    } else {
      userToSave = result.user || result.data?.user || result;
    }

    setUser(userToSave || null);
    if (credential) setUserPassword(credential);
    if (userToSave) ensureE2EEKeys(userToSave.agentId, false, credential);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
  };

  const loginAgent = async (agentId: string, apiKey: string) => {
    const result = await loginAgentApi({ agentId, apiKey });
    const userToSave = result.user || result.data?.user || result;
    setUser(userToSave || null);
    if (apiKey) setUserPassword(apiKey);
    if (userToSave) ensureE2EEKeys(userToSave.agentId, false, apiKey);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
  };

  const register = async (email: string, password: string, agentName?: string, bio?: string, customAgentId?: string) => {
    const resData = await registerUserApi({ 
      email, 
      password, 
      agentName, 
      name: agentName,
      bio,
      agentId: customAgentId 
    } as any);
    
    const userToSave = resData.user || resData.data?.user;

    if (password) setUserPassword(password);

    if (userToSave) {
      setUser(userToSave);
      ensureE2EEKeys(userToSave.agentId, false, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      }
    } else {
      const returnedAgentId = resData.agentId || resData.user?.agentId || '';
      if (returnedAgentId && password) {
        try {
          await login(returnedAgentId, password);
        } catch (e) {
          console.warn('Post-registration login failed:', e);
        }
      }
    }
    
    return { 
      agentId: resData.agentId || resData.user?.agentId || '', 
      apiKey: resData.apiKey || '',
      user: resData.user
    };
  };

  const logout = async () => {
    try {
      await logoutUserApi();
    } catch (e) {
      console.warn('Logout API error:', e);
    }
    setUser(null);
    setUserPassword(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
    }
  };

  const deleteAccount = async () => {
    await deleteAccountApi();
    setUser(null);
    setUserPassword(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
    }
  };

  const updatePassword = (_pwd: string) => {
    // Password is not saved in localStorage
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const updatedUser = await updateProfileApi(updates);
      setUser(updatedUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_user', JSON.stringify(updatedUser));
      }
    } catch (err) {
      console.warn('Failed to update profile:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        userPassword,
        updatePassword,
        login,
        loginAgent,
        register,
        logout,
        deleteAccount,
        refreshProfile,
        updateProfile,
        rotateE2EEKeys,
      }}
    >
      {children}
      <WebAuthnEnableModal
        isOpen={!!webAuthnPrompt}
        pendingToken={webAuthnPrompt?.pendingToken || ''}
        options={webAuthnPrompt?.options}
        userName={webAuthnPrompt?.userName}
        onSuccess={(userData) => {
          const finalUser = userData?.user || userData?.data?.user || userData;
          webAuthnPrompt?.resolve(finalUser);
          setWebAuthnPrompt(null);
        }}
        onCancel={() => {
          webAuthnPrompt?.reject(new Error('WebAuthn passkey setup is required to complete login.'));
          setWebAuthnPrompt(null);
        }}
      />
      <WebAuthnVerifyModal
        isOpen={!!webAuthnVerifyPrompt}
        pendingToken={webAuthnVerifyPrompt?.pendingToken || ''}
        options={webAuthnVerifyPrompt?.options}
        userName={webAuthnVerifyPrompt?.userName}
        onSuccess={(userData) => {
          const finalUser = userData?.user || userData?.data?.user || userData;
          webAuthnVerifyPrompt?.resolve(finalUser);
          setWebAuthnVerifyPrompt(null);
        }}
        onCancel={() => {
          webAuthnVerifyPrompt?.reject(new Error('Device credential prompt was cancelled or timed out.'));
          setWebAuthnVerifyPrompt(null);
        }}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
