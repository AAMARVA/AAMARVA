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
  normalizeAgentId,
  StoredAgentKeyEntry,
  bootstrapAgentIdentity,
  constructIdentityRegistrationPayload
} from '../lib/e2ee';

export type E2EEStatus = 'initializing' | 'ready' | 'recovery_required' | 'recovery_in_progress' | 'failed';

interface AuthContextType {
  user: UserProfile | null;
  activeAccount: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionAuthType: 'human' | 'agent';
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
  switchActiveAccount?: (targetUserId: string) => Promise<void>;
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
  const [activeAccount, setActiveAccount] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('aamarva_active_account');
        if (stored && stored !== 'undefined') {
          return JSON.parse(stored);
        }
      } catch (err) {
        localStorage.removeItem('aamarva_active_account');
      }
    }
    return null;
  });
  const [userPassword, setUserPassword] = useState<string | null>(null);
  const [sessionAuthType, setSessionAuthType] = useState<'human' | 'agent'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('aamarva_session_auth_type');
      if (stored === 'human' || stored === 'agent') return stored;
    }
    return getAccessToken() ? 'agent' : 'human';
  });
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
    const authType = sessionAuthType;
    const flightKey = `${normalizedAgentId}:${forceRotate}:${activeCredential ? 'with-cred' : 'no-cred'}`;

    const existingPromise = inFlightE2EERef.current.get(flightKey);
    if (existingPromise) {
      return existingPromise;
    }

    const verifyServerKeyRegistration = async (expectedPublicKey: string, expectedFingerprint: string): Promise<boolean> => {
      try {
        const res = await apiFetch('/api/agents/me/e2ee', { authType });
        const remoteKey = res?.data?.publicKey || res?.publicKey;
        const remoteFp = res?.data?.fingerprint || res?.fingerprint;
        if (remoteKey === expectedPublicKey && (!expectedFingerprint || (remoteFp && remoteFp === expectedFingerprint))) {
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    };

    const runInitialization = async (): Promise<boolean> => {
      setE2EEStatus('initializing');
      try {
        let keys = await getLocalKeyPair(normalizedAgentId);
        const isCompleteKey = !!(keys && keys.publicKey && keys.privateKey && keys.identityPublicKey && keys.signature);

        if (!isCompleteKey && !forceRotate) {
          setE2EEStatus('recovery_in_progress');

          let hasRecoveryVault = false;
          let rawVault: any = null;

          // For human sessions, check if an existing recovery vault exists on the server
          if (authType === 'human') {
            try {
              const recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType });
              if (recoveryRes && recoveryRes.success && recoveryRes.data?.recoveryVault) {
                rawVault = recoveryRes.data.recoveryVault;
                hasRecoveryVault = true;
              }
            } catch (recFetchErr) {
              console.log('E2EE recovery vault check note (expected for first-time sessions):', recFetchErr);
            }
          }

          if (hasRecoveryVault) {
            if (!activeCredential) {
              console.warn('E2EE identity missing in local keystore and recovery vault exists on server; recovery required.');
              setE2EEStatus('recovery_required');
              return false;
            }

            if (typeof rawVault !== 'object' || !rawVault.ciphertext || !rawVault.nonce) {
              console.warn('E2EE recovery vault exists on server but structure is corrupted or missing ciphertext/nonce.');
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
                const confirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
                if (confirmed) {
                  setE2EEStatus('ready');
                  return true;
                } else {
                  setE2EEStatus('failed');
                  return false;
                }
              } else {
                throw new Error('RECOVERY_RESTORE_INCOMPLETE: Vault restoration did not produce valid operational keys.');
              }
            } catch (restoreErr: any) {
              console.warn('E2EE recovery vault decryption/restoration notice:', restoreErr?.message || restoreErr);
              setE2EEStatus('recovery_required');
              return false;
            }
          }

          // State A: First-time setup for agent or human without prior recovery vault
          console.log('Establishing initial cryptographic identity for agent (first-time setup):', normalizedAgentId);
          const identity = await generateAgentCryptoIdentity(normalizedAgentId);

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

          // Publish public key and identity binding to server (MUST throw/fail if publication fails)
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

          // Confirm via GET endpoint
          const confirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
          if (!confirmed) {
            throw new Error('SERVER_KEY_CONFIRMATION_FAILED: Public key not confirmed via GET endpoint after registration.');
          }

          // If credential is in memory, create and store encrypted recovery vault on server
          if (activeCredential) {
            try {
              const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential);
              await apiFetch('/api/agents/me/e2ee/recovery', {
                method: 'PUT',
                authType,
                body: JSON.stringify({ recoveryVault: vault })
              });
              clearTransientJwkKeys(normalizedAgentId);
            } catch (vaultErr: any) {
              console.warn('E2EE recovery vault preservation note:', vaultErr?.message || vaultErr);
            }
          }
        } else if (isCompleteKey) {
          // Verify that server has published public key matching existing local keys
          const confirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
          if (!confirmed) {
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
            const reconfirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
            if (!reconfirmed) {
              throw new Error('SERVER_KEY_CONFIRMATION_FAILED: Public key sync could not be confirmed via GET endpoint.');
            }
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

          const confirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
          if (!confirmed) {
            throw new Error('SERVER_KEY_CONFIRMATION_FAILED: Rotated public key not confirmed via GET endpoint.');
          }

          if (activeCredential) {
            try {
              let existingVault: any = undefined;
              try {
                const recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType });
                if (recoveryRes?.data?.recoveryVault?.ciphertext) {
                  existingVault = recoveryRes.data.recoveryVault;
                }
              } catch (fetchErr) {
                console.warn('E2EE recovery vault fetch during rotation note:', fetchErr);
              }

              const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential, undefined, existingVault);
              await apiFetch('/api/agents/me/e2ee/recovery', {
                method: 'PUT',
                authType,
                body: JSON.stringify({ recoveryVault: vault })
              });
              clearTransientJwkKeys(normalizedAgentId);
            } catch (vaultErr: any) {
              console.warn('E2EE recovery vault rotation update note:', vaultErr?.message || vaultErr);
            }
          }
        } else if (isCompleteKey && activeCredential) {
          try {
            const recoveryRes = await apiFetch('/api/agents/me/e2ee/recovery', { authType });
            if (!recoveryRes?.data?.recoveryVault?.ciphertext) {
              const vault = await createEncryptedRecoveryVault(normalizedAgentId, activeCredential);
              await apiFetch('/api/agents/me/e2ee/recovery', {
                method: 'PUT',
                authType,
                body: JSON.stringify({ recoveryVault: vault })
              });
              clearTransientJwkKeys(normalizedAgentId);
            }
          } catch (recCheckErr) {
            // Non-fatal
          }
        }

        if (keys && keys.privateKey && keys.publicKey) {
          const finalConfirmed = await verifyServerKeyRegistration(keys.publicKey, keys.fingerprint);
          if (finalConfirmed) {
            setE2EEStatus('ready');
            return true;
          } else {
            setE2EEStatus('failed');
            return false;
          }
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
  }, [userPassword, sessionAuthType]);

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
        // The server returns the profile of the ACTIVE account
        setActiveAccount(profile);
        if (typeof window !== 'undefined') {
          localStorage.setItem('aamarva_active_account', JSON.stringify(profile));
        }

        // If the active account is a Master, or if this is the first load and we don't have a user yet, update user as well
        if (profile.isMasterUser || !user) {
           setUser(profile);
           if (typeof window !== 'undefined') {
             localStorage.setItem('aamarva_user', JSON.stringify(profile));
           }
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
      setActiveAccount(null);
      setUserPassword(null);
      setE2EEStatus('failed');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_active_account');
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
          setActiveAccount(null);
          setE2EEStatus('failed');
        }
      }
      if (e.key === 'aamarva_active_account') {
        if (e.newValue) {
          try {
            setActiveAccount(JSON.parse(e.newValue));
          } catch (err) {
            console.warn('Failed to sync active account from storage:', err);
          }
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

    let rawUser = userToSave;
    if (rawUser && typeof rawUser === 'object') {
      if ('user' in rawUser && rawUser.user) rawUser = rawUser.user;
      else if ('data' in rawUser && rawUser.data?.user) rawUser = rawUser.data.user;
    }
    const finalUser = rawUser || null;

    setUser(finalUser);
    setActiveAccount(finalUser);
    if (credential) setUserPassword(credential);
    setSessionAuthType('human');
    if (typeof window !== 'undefined') {
      localStorage.setItem('aamarva_session_auth_type', 'human');
      if (finalUser) {
        localStorage.setItem('aamarva_user', JSON.stringify(finalUser));
        localStorage.setItem('aamarva_active_account', JSON.stringify(finalUser));
      } else {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_active_account');
      }
    }
    if (finalUser?.agentId) {
      await ensureE2EEKeys(finalUser.agentId, false, credential);
    }
    await refreshProfile();
  };

  const loginAgent = async (agentId: string, apiKey: string) => {
    const result = await loginAgentApi({ agentId, apiKey });
    const userToSave = result.user || result.data?.user || result;
    setUser(userToSave || null);
    setActiveAccount(userToSave || null);
    if (apiKey) setUserPassword(apiKey);
    setSessionAuthType('agent');
    if (typeof window !== 'undefined') {
      localStorage.setItem('aamarva_session_auth_type', 'agent');
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
        localStorage.setItem('aamarva_active_account', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_active_account');
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
    
    const user = resData.user || resData.data?.user;
    const agentId = resData.agentId || user?.agentId || '';

    // Automatic E2EE Bootstrap
    if (agentId) {
      try {
        const { identity } = await bootstrapAgentIdentity(agentId, password);
        await apiFetch('/api/agents/me/e2ee', {
          method: 'PUT',
          authType: 'human', // Browser context
          body: JSON.stringify(constructIdentityRegistrationPayload(identity))
        });
        setE2EEStatus('ready');
      } catch (e) {
        console.error('Automatic E2EE bootstrap failed during registration:', e);
        setE2EEStatus('failed');
      }
    }

    return { 
      agentId,
      apiKey: resData.apiKey || '',
      user
    };
  };

  const logout = async () => {
    try {
      await logoutUserApi();
    } catch (e) {
      console.warn('Logout API error:', e);
    }
    setUser(null);
    setActiveAccount(null);
    setUserPassword(null);
    setE2EEStatus('failed');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
      localStorage.removeItem('aamarva_active_account');
      localStorage.removeItem('aamarva_session_auth_type');
    }
  };

  const deleteAccount = async () => {
    const rawUser = activeAccount || user;
    const currentUser = rawUser ? ((rawUser as any).profile || rawUser) : null;
    const masterId = currentUser?.master_id || currentUser?.masterUserId || user?.id;

    const isSlave = !!(
      (currentUser?.master_id && currentUser?.id && currentUser.master_id !== currentUser.id) ||
      (currentUser?.masterUserId && currentUser?.id && currentUser.masterUserId !== currentUser.id) ||
      currentUser?.account_type === 'slave' ||
      currentUser?.role === 'slave' ||
      (currentUser?.email && currentUser.email.includes('+AMR-')) ||
      (activeAccount?.agentId && user?.agentId && activeAccount.agentId.toUpperCase() !== user.agentId.toUpperCase())
    );

    if (isSlave) {
      const targetSlaveId = currentUser?.id || activeAccount?.id || user?.id || '';

      try {
        await apiFetch('/api/auth/master/undeploy-slave-agent', {
          method: 'POST',
          authType: 'human',
          body: JSON.stringify({ 
            slaveAgentId: targetSlaveId,
            subAgentId: targetSlaveId,
            agentId: targetSlaveId
          })
        });
      } catch (err: any) {
        console.warn('[deleteAccount] undeploy-slave-agent error:', err?.message || err);
        throw err;
      }

      // Auto switch back to master account
      if (masterId && masterId !== targetSlaveId) {
        try {
          await apiFetch('/api/auth/master/switch', {
            method: 'POST',
            authType: 'human',
            body: JSON.stringify({ targetAgentId: masterId })
          });
        } catch (switchErr) {
          console.warn('[deleteAccount] Auto-switch back to master account notice:', switchErr);
        }
      }

      await refreshProfile();
      window.dispatchEvent(new CustomEvent('aamarva-agents-updated'));
      return;
    }

    // Otherwise, master account deletion
    await deleteAccountApi();
    setUser(null);
    setActiveAccount(null);
    setUserPassword(null);
    setE2EEStatus('failed');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
      localStorage.removeItem('aamarva_active_account');
    }
  };

  const updatePassword = (pwd: string) => {
    if (pwd) setUserPassword(pwd);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const updatedUser = await updateProfileApi(updates);
      // Update active account context
      setActiveAccount(updatedUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_active_account', JSON.stringify(updatedUser));
      }
      // If the updated profile is the Master, sync Master state
      if (updatedUser.isMasterUser) {
         setUser(updatedUser);
         if (typeof window !== 'undefined') {
           localStorage.setItem('aamarva_user', JSON.stringify(updatedUser));
         }
      }
    } catch (err) {
      console.warn('Failed to update profile:', err);
      throw err;
    }
  };

  const switchActiveAccount = async (targetUserId: string) => {
    const res = await apiFetch('/api/auth/master/switch', {
      method: 'POST',
      body: JSON.stringify({ targetAgentId: targetUserId }), // Changed key to targetAgentId
      authType: 'human'
    });
    // ... rest of the function
    if (res?.success && res.data?.user) {
      const newUserProfile = res.data.user;
      setActiveAccount(newUserProfile);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_active_account', JSON.stringify(newUserProfile));
      }
      await ensureE2EEKeys(newUserProfile.agentId, false, userPassword || undefined);
    } else {
      throw new Error(res?.error?.message || 'Failed to switch account.');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeAccount,
        isAuthenticated: !!(user || activeAccount),
        isLoading,
        sessionAuthType,
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
        switchActiveAccount,
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
