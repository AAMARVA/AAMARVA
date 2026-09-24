import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  saveLocalKeyPair,
  createEncryptedRecoveryVault,
  restoreFromEncryptedRecoveryVault,
  clearTransientJwkKeys,
  StoredAgentKeyEntry
} from '../lib/e2ee';

export type E2EEStatus = 'initializing' | 'ready' | 'recovery_required' | 'recovery_in_progress' | 'failed';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  e2eeStatus: E2EEStatus;
  isE2EEReady: boolean;
  ensureE2EEKeys: (agentId: string, forceRotate?: boolean, credential?: string) => Promise<boolean>;
  userPassword?: string | null;
  updatePassword?: (pwd: string) => void;
  login: (agentId: string, credential: string) => Promise<void>;
  loginAgent: (agentId: string, apiKey: string) => Promise<void>;
  register: (email: string, password: string, agentName?: string, bio?: string, customAgentId?: string) => Promise<{ agentId: string; apiKey: string; user?: any }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  rotateE2EEKeys?: (credential?: string) => Promise<void>;
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
  const [e2eeStatus, setE2EEStatus] = useState<E2EEStatus>('initializing');
  const inFlightE2EERef = useRef<Map<string, Promise<boolean>>>(new Map());

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

  const ensureE2EEKeys = useCallback(async (agentId: string, forceRotate: boolean = false, credential?: string): Promise<boolean> => {
    if (typeof window === 'undefined' || !agentId) {
      setE2EEStatus('failed');
      return false;
    }

    const normalizedAgentId = agentId.trim().toUpperCase();
    const activeCredential = credential || userPassword;
    const flightKey = `${normalizedAgentId}:${forceRotate}:${activeCredential ? 'with-cred' : 'no-cred'}`;

    const existingPromise = inFlightE2EERef.current.get(flightKey);
    if (existingPromise) {
      return existingPromise;
    }

    const runInitialization = async (): Promise<boolean> => {
      setE2EEStatus('initializing');
      try {
        let keys = await getLocalKeyPair(normalizedAgentId);
        const isCompleteKey = !!(keys && keys.publicKey && keys.privateKey && keys.identityPublicKey && keys.signature);

        if (!isCompleteKey && !forceRotate) {
          if (!activeCredential) {
            // Genuinely missing local key and no credential available in memory to reconstruct or recover identity.
            // Mark state as recovery_required so UI can prompt for recovery credential without breaking other features.
            console.warn('E2EE identity missing in local keystore and no credential in memory to recover.');
            setE2EEStatus('recovery_required');
            return false;
          }

          setE2EEStatus('recovery_in_progress');

          // Query the server for an existing recovery vault
          let recoveryRes: any = null;
          try {
            recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType: 'human' });
          } catch (recFetchErr) {
            console.error('E2EE recovery vault fetch failed (network or server error):', recFetchErr);
            // FAIL-CLOSED (Requirement 3): Network or download failure when querying recovery vault.
            // We MUST NOT assume "no vault exists" and MUST NOT create replacement keys.
            setE2EEStatus('recovery_required');
            return false;
          }

          if (!recoveryRes || recoveryRes.success === false) {
            console.error('E2EE recovery query unsuccessful:', recoveryRes);
            // FAIL-CLOSED: Server returned unsuccessful response. Never generate replacement keys.
            setE2EEStatus('recovery_required');
            return false;
          }

          const rawVault = recoveryRes?.data?.recoveryVault;
          const hasRecoveryVault = rawVault !== null && rawVault !== undefined;

          if (hasRecoveryVault) {
            // State B or State C: An encrypted recovery vault exists on the server.
            // Failure to recover this vault must NEVER fall through to first-time key generation or identity replacement.
            if (typeof rawVault !== 'object' || !rawVault.ciphertext || !rawVault.nonce) {
              console.error('E2EE recovery vault exists on server but structure is corrupted or missing ciphertext/nonce.');
              // FAIL-CLOSED: Malformed or corrupted vault artifact.
              setE2EEStatus('recovery_required');
              return false;
            }

            try {
              console.log('Restoring existing E2EE identity from encrypted zero-knowledge recovery vault for agent:', normalizedAgentId);
              const restored = await restoreFromEncryptedRecoveryVault(
                normalizedAgentId,
                activeCredential,
                rawVault
              );

              if (restored?.activeKey && restored.activeKey.privateKey && restored.activeKey.publicKey) {
                keys = restored.activeKey;
                setE2EEStatus('ready');
                return true;
              } else {
                throw new Error('RECOVERY_RESTORE_INCOMPLETE: Vault restoration did not produce valid operational keys.');
              }
            } catch (restoreErr: any) {
              console.error('E2EE recovery vault decryption/restoration failed:', restoreErr?.message || restoreErr);
              // FAIL-CLOSED (Requirements 1, 2, 3, 4, 9):
              // Recovery failed (wrong credential, corrupted ciphertext, tamper, decryption error).
              // DO NOT fall through to key derivation.
              // DO NOT generate replacement keys.
              // DO NOT overwrite recovery vault.
              // DO NOT replace server-side public E2EE identity.
              setE2EEStatus('recovery_required');
              return false;
            }
          }

          // State A: Server confirms that NO recovery vault exists (first-time setup or legacy account that never had a vault)
          console.log('Establishing initial cryptographic identity for agent (first-time setup):', normalizedAgentId);
          const identity = await deriveAgentCryptoIdentity(normalizedAgentId, activeCredential);

          await saveLocalKeyPair(
            normalizedAgentId,
            identity.e2eePublicKey,
            identity.e2eePrivateKey,
            identity.fingerprint,
            identity.identityPublicKey,
            identity.identityPrivateKey,
            identity.signature,
            identity.keyEpoch || 1,
            identity.transientPrivateKeyJwk,
            identity.transientIdentityPrivateKeyJwk
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

          // Publish public key and identity binding to server
          try {
            await apiFetch('/api/agents/me/e2ee', {
              method: 'PUT',
              authType: 'human',
              body: JSON.stringify({ 
                publicKey: keys.publicKey,
                fingerprint: keys.fingerprint,
                identityKey: keys.identityPublicKey,
                signature: keys.signature,
                keyEpoch: keys.keyEpoch || 1,
                allowRotation: false
              })
            });
          } catch (pubErr: any) {
            console.warn('E2EE key publication note:', pubErr?.message || pubErr);
          }

          // Create and store encrypted recovery vault on server for future multi-device sync
          try {
            const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential);
            await apiFetch('/api/agents/me/e2ee/recovery', {
              method: 'PUT',
              authType: 'human',
              body: JSON.stringify({ recoveryVault: vault })
            });
            // Explicitly clear transient JWKs ONLY after successful recovery-vault upload
            clearTransientJwkKeys(normalizedAgentId);
          } catch (vaultErr: any) {
            console.warn('E2EE recovery vault preservation note:', vaultErr?.message || vaultErr);
          }
        } else if (forceRotate) {
          console.log('Performing authorized key rotation for agent:', normalizedAgentId);
          const rotated = await rotateAgentCryptoIdentity(normalizedAgentId, keys?.keyEpoch);
          keys = {
            publicKey: rotated.e2eePublicKey,
            privateKey: rotated.e2eePrivateKey,
            fingerprint: rotated.fingerprint,
            identityPublicKey: rotated.identityPublicKey,
            identityPrivateKey: rotated.identityPrivateKey,
            signature: rotated.signature,
            keyEpoch: rotated.keyEpoch
          };

          await apiFetch('/api/agents/me/e2ee', {
            method: 'PUT',
            authType: 'human',
            body: JSON.stringify({ 
              publicKey: keys.publicKey,
              fingerprint: keys.fingerprint,
              identityKey: keys.identityPublicKey,
              signature: keys.signature,
              keyEpoch: keys.keyEpoch || 1,
              allowRotation: true
            })
          });

          if (activeCredential) {
            try {
              let existingVault: any = undefined;
              try {
                const recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType: 'human' });
                if (recoveryRes?.data?.recoveryVault?.ciphertext) {
                  existingVault = recoveryRes.data.recoveryVault;
                }
              } catch (fetchErr) {
                console.warn('E2EE recovery vault fetch during rotation note:', fetchErr);
              }

              const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential, undefined, existingVault);
              await apiFetch('/api/agents/me/e2ee/recovery', {
                method: 'PUT',
                authType: 'human',
                body: JSON.stringify({ recoveryVault: vault })
              });
              // Explicitly clear transient JWKs ONLY after successful recovery-vault upload
              clearTransientJwkKeys(normalizedAgentId);
            } catch (vaultErr: any) {
              console.warn('E2EE recovery vault rotation update note:', vaultErr?.message || vaultErr);
            }
          }
        } else if (isCompleteKey && activeCredential) {
          // Opportunistically ensure encrypted recovery vault is backed up if not present
          try {
            const recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType: 'human' });
            if (!recoveryRes?.data?.recoveryVault?.ciphertext) {
              const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential);
              await apiFetch('/api/agents/me/e2ee/recovery', {
                method: 'PUT',
                authType: 'human',
                body: JSON.stringify({ recoveryVault: vault })
              });
              // Explicitly clear transient JWKs ONLY after successful recovery-vault upload
              clearTransientJwkKeys(normalizedAgentId);
            }
          } catch (recCheckErr) {
            // Non-fatal
          }
        }

        if (keys && keys.privateKey && keys.publicKey) {
          setE2EEStatus('ready');
          return true;
        } else {
          setE2EEStatus('failed');
          return false;
        }
      } catch (e: any) {
        console.warn('E2EE Key initialization notice:', e?.message || e);
        setE2EEStatus('failed');
        return false;
      } finally {
        inFlightE2EERef.current.delete(flightKey);
      }
    };

    const promise = runInitialization();
    inFlightE2EERef.current.set(flightKey, promise);
    return promise;
  }, [userPassword]);

  const rotateE2EEKeys = async (credential?: string) => {
    if (!user?.agentId) throw new Error('No authenticated agent.');
    const activeCredential = credential || userPassword || undefined;
    await ensureE2EEKeys(user.agentId, true, activeCredential);
    await refreshProfile();
  };

  const refreshProfile = async () => {
    try {
      const profile = await fetchCurrentProfileApi();
      if (profile) {
        setUser(profile);
        if (typeof window !== 'undefined') {
          localStorage.setItem('aamarva_user', JSON.stringify(profile));
        }
        await ensureE2EEKeys(profile.agentId, false, userPassword || undefined);
      } else {
        setE2EEStatus('failed');
      }
    } catch (err: any) {
      // If unauthorized, the auth-unauthorized event will handle logout
      console.warn('Profile sync failed:', err?.message || err);
      setE2EEStatus('failed');
    }
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('Unauthorized token or deleted user detected. Logging out.');
      setUser(null);
      setUserPassword(null);
      setE2EEStatus('failed');
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
          setE2EEStatus('failed');
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
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
    if (userToSave) {
      await ensureE2EEKeys(userToSave.agentId, false, credential);
    }
  };

  const loginAgent = async (agentId: string, apiKey: string) => {
    const result = await loginAgentApi({ agentId, apiKey });
    const userToSave = result.user || result.data?.user || result;
    setUser(userToSave || null);
    if (apiKey) setUserPassword(apiKey);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
    if (userToSave) {
      await ensureE2EEKeys(userToSave.agentId, false, apiKey);
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      }
      await ensureE2EEKeys(userToSave.agentId, false, password);
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
    setE2EEStatus('failed');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
    }
  };

  const deleteAccount = async () => {
    await deleteAccountApi();
    setUser(null);
    setUserPassword(null);
    setE2EEStatus('failed');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
    }
  };

  const updatePassword = (pwd: string) => {
    if (pwd) setUserPassword(pwd);
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
        e2eeStatus,
        isE2EEReady: e2eeStatus === 'ready',
        ensureE2EEKeys,
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
