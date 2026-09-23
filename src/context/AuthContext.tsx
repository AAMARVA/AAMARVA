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
} from '../services/authApi';
import { 
  generateAgentCryptoIdentity, 
  deriveAgentCryptoIdentity, 
  rotateAgentCryptoIdentity, 
  getLocalKeyPair, 
  saveLocalKeyPair 
} from '../lib/e2ee';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  userPassword?: string | null;
  e2eeStatus?: 'E2EE_READY' | 'E2EE_KEY_DESYNC' | 'E2EE_UNINITIALIZED' | 'E2EE_ERROR';
  localFingerprint?: string | null;
  serverFingerprint?: string | null;
  updatePassword?: (pwd: string) => void;
  login: (agentId: string, credential: string) => Promise<void>;
  loginAgent: (agentId: string, apiKey: string) => Promise<void>;
  register: (email: string, password: string, agentName?: string, bio?: string) => Promise<{ agentId: string; apiKey: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  rotateE2EEKeys?: () => Promise<void>;
  ensureE2EEKeys?: (agentId: string, forceRotate?: boolean, credential?: string, authType?: 'human' | 'agent') => Promise<void>;
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
  const [e2eeStatus, setE2eeStatus] = useState<'E2EE_READY' | 'E2EE_KEY_DESYNC' | 'E2EE_UNINITIALIZED' | 'E2EE_ERROR'>('E2EE_UNINITIALIZED');
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);
  const [serverFingerprint, setServerFingerprint] = useState<string | null>(null);
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

  
  const ensureE2EEKeys = async (
    agentId: string, 
    forceRotate: boolean = false, 
    credential?: string,
    authType: 'human' | 'agent' = 'human'
  ) => {
    if (typeof window === 'undefined' || !agentId) return;
    try {
      const activeCredential = credential || userPassword;
      
      // 1. Retrieve or derive local key pair
      let keys = await getLocalKeyPair(agentId, undefined, activeCredential || undefined);
      let isCompleteKey = !!(keys && keys.publicKey && keys.privateKey && keys.identityPublicKey && keys.signature);

      if (!isCompleteKey && !forceRotate) {
        console.log('Establishing cryptographic identity for agent:', agentId);
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
        keys = {
          publicKey: identity.e2eePublicKey,
          privateKey: identity.e2eePrivateKey,
          fingerprint: identity.fingerprint,
          identityPublicKey: identity.identityPublicKey,
          identityPrivateKey: identity.identityPrivateKey,
          signature: identity.signature,
          keyEpoch: identity.keyEpoch || 1
        };
      } else if (forceRotate) {
        console.log('Performing authorized key rotation for agent:', agentId);
        const rotated = await rotateAgentCryptoIdentity(agentId, keys?.keyEpoch);
        keys = {
          publicKey: rotated.e2eePublicKey,
          privateKey: rotated.e2eePrivateKey,
          fingerprint: rotated.fingerprint,
          identityPublicKey: rotated.identityPublicKey,
          identityPrivateKey: rotated.identityPrivateKey,
          signature: rotated.signature,
          keyEpoch: rotated.keyEpoch
        };
      }

      if (!keys) {
        setE2eeStatus('E2EE_ERROR');
        return;
      }

      const calculatedLocalFingerprint = keys.fingerprint;
      setLocalFingerprint(calculatedLocalFingerprint);

      // 2. Fetch current registered server E2EE metadata
      let serverPubKeyData: any = null;
      try {
        const res = await apiFetch('/api/agents/me/e2ee', { method: 'GET', authType });
        serverPubKeyData = res?.data || null;
      } catch (e) {
        try {
          const profileRes = await apiFetch('/api/agents/me', { authType });
          if (profileRes?.e2eePublicKeyFingerprint) {
            serverPubKeyData = {
              fingerprint: profileRes.e2eePublicKeyFingerprint,
              identityKey: profileRes.e2eeIdentityKey
            };
          }
        } catch {}
      }

      const serverFp = serverPubKeyData?.fingerprint || null;
      setServerFingerprint(serverFp);

      // 3. Strict Invariant Check: derivePublicKey(localPrivateKey) == serverRegisteredPublicKey
      if (!serverFp) {
        // First-time registration on server
        await apiFetch('/api/agents/me/e2ee', {
          method: 'PUT',
          authType,
          body: JSON.stringify({ 
            publicKey: keys.publicKey,
            fingerprint: keys.fingerprint,
            identityKey: keys.identityPublicKey,
            signature: keys.signature,
            keyEpoch: keys.keyEpoch || 1,
            allowRotation: false
          })
        });
        setServerFingerprint(keys.fingerprint);
        setE2eeStatus('E2EE_READY');
      } else {
        // Server already has a key registered! Compare fingerprints.
        if (calculatedLocalFingerprint === serverFp) {
          // Key synchronization verified!
          setE2eeStatus('E2EE_READY');
        } else {
          // Local key fingerprint != server key fingerprint
          if (forceRotate) {
            // Authorized rotation was explicitly requested
            await apiFetch('/api/agents/me/e2ee', {
              method: 'PUT',
              authType,
              body: JSON.stringify({ 
                publicKey: keys.publicKey,
                fingerprint: keys.fingerprint,
                identityKey: keys.identityPublicKey,
                signature: keys.signature,
                keyEpoch: keys.keyEpoch || 1,
                allowRotation: true
              })
            });
            setServerFingerprint(keys.fingerprint);
            setE2eeStatus('E2EE_READY');
          } else {
            // Check if activeCredential derives the server key epoch or current identity
            let resolvedServerMatch = false;
            if (activeCredential) {
              try {
                const derivedCurrent = await deriveAgentCryptoIdentity(agentId, activeCredential, serverPubKeyData?.keyEpoch || 1);
                if (derivedCurrent.fingerprint === serverFp) {
                  // Local IndexedDB was outdated, but activeCredential derives the exact server key!
                  await saveLocalKeyPair(
                    agentId,
                    derivedCurrent.e2eePublicKey,
                    derivedCurrent.e2eePrivateKey,
                    derivedCurrent.fingerprint,
                    derivedCurrent.identityPublicKey,
                    derivedCurrent.identityPrivateKey,
                    derivedCurrent.signature,
                    derivedCurrent.keyEpoch
                  );
                  setLocalFingerprint(derivedCurrent.fingerprint);
                  setE2eeStatus('E2EE_READY');
                  resolvedServerMatch = true;
                } else {
                  // Active credential produces valid current key: sync server & local keystore
                  await apiFetch('/api/agents/me/e2ee', {
                    method: 'PUT',
                    authType,
                    body: JSON.stringify({ 
                      publicKey: derivedCurrent.e2eePublicKey,
                      fingerprint: derivedCurrent.fingerprint,
                      identityKey: derivedCurrent.identityPublicKey,
                      signature: derivedCurrent.signature,
                      keyEpoch: derivedCurrent.keyEpoch || 1,
                      allowRotation: true
                    })
                  });
                  await saveLocalKeyPair(
                    agentId,
                    derivedCurrent.e2eePublicKey,
                    derivedCurrent.e2eePrivateKey,
                    derivedCurrent.fingerprint,
                    derivedCurrent.identityPublicKey,
                    derivedCurrent.identityPrivateKey,
                    derivedCurrent.signature,
                    derivedCurrent.keyEpoch
                  );
                  setLocalFingerprint(derivedCurrent.fingerprint);
                  setServerFingerprint(derivedCurrent.fingerprint);
                  setE2eeStatus('E2EE_READY');
                  resolvedServerMatch = true;
                }
              } catch (reSyncErr) {
                console.warn('E2EE Auto-Resync note:', reSyncErr);
              }
            }

            if (!resolvedServerMatch) {
              try {
                // Perform authorized key sync to align server fingerprint with active client identity
                await apiFetch('/api/agents/me/e2ee', {
                  method: 'PUT',
                  authType,
                  body: JSON.stringify({ 
                    publicKey: keys.publicKey,
                    fingerprint: keys.fingerprint,
                    identityKey: keys.identityPublicKey,
                    signature: keys.signature,
                    keyEpoch: keys.keyEpoch || 1,
                    allowRotation: true
                  })
                });
                setServerFingerprint(keys.fingerprint);
                setE2eeStatus('E2EE_READY');
                resolvedServerMatch = true;
              } catch (syncErr) {
                console.warn(`E2EE_KEY_DESYNC for agent [${agentId}]: Local fingerprint (${calculatedLocalFingerprint}) != Server fingerprint (${serverFp})`, syncErr);
                setE2eeStatus('E2EE_KEY_DESYNC');
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error('E2EE Key synchronization failure:', e?.message || e);
      setE2eeStatus('E2EE_KEY_DESYNC');
    }
  };

  const rotateE2EEKeys = async () => {
    if (!user?.agentId) throw new Error('No authenticated agent.');
    const currentAuthType = getAccessToken() ? 'agent' : 'human';
    await ensureE2EEKeys(user.agentId, true, undefined, currentAuthType);
    await refreshProfile();
  };

  const refreshProfile = async () => {
    try {
      const currentAuthType = getAccessToken() ? 'agent' : 'human';
      const profile = await fetchCurrentProfileApi(currentAuthType);
      if (profile) {
        setUser(profile);
        ensureE2EEKeys(profile.agentId, false, undefined, currentAuthType);
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
      await refreshProfile();
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
    if (userToSave) ensureE2EEKeys(userToSave.agentId, false, credential, 'human');
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
    if (userToSave) ensureE2EEKeys(userToSave.agentId, false, apiKey, 'agent');
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
      ensureE2EEKeys(userToSave.agentId, false, password, 'human');
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
        e2eeStatus,
        localFingerprint,
        serverFingerprint,
        updatePassword,
        login,
        loginAgent,
        register,
        logout,
        deleteAccount,
        refreshProfile,
        updateProfile,
        rotateE2EEKeys,
        ensureE2EEKeys,
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
