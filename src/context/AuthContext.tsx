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
      let keys = await getLocalKeyPair(agentId, undefined, activeCredential || undefined);

      if (keys && keys.publicKey && keys.privateKey && !forceRotate) {
        // 1. Valid local key pair already exists: retain existing private key and complete binding if needed
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
          keys = {
            ...keys,
            fingerprint: fp,
            identityPublicKey: idSign.identityPublicKey,
            identityPrivateKey: idSign.identityPrivateKey,
            signature,
            keyEpoch: keys.keyEpoch || 1
          };
        }
      } else if (!keys && !forceRotate) {
        // 2. No local key pair exists: generate or deterministically derive P-256 ECDH key pair
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
        // 3. Explicit key rotation
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

      if (keys && keys.publicKey) {
        // Determine whether request is authenticated via agent token, agent api key, or human cookie
        const isAgentToken = typeof window !== 'undefined' && !!getAccessToken();
        const authType: AuthType = isAgentToken ? 'agent' : 'human';
        const headers: Record<string, string> = {};
        if (!isAgentToken && user?.apiKey) {
          headers['x-api-key'] = user.apiKey;
        }

        // Publish ONLY public key and identity binding to server using existing PUT /api/agents/me/e2ee
        await apiFetch('/api/agents/me/e2ee', {
          method: 'PUT',
          authType,
          headers,
          body: JSON.stringify({ 
            publicKey: keys.publicKey,
            fingerprint: keys.fingerprint,
            identityKey: keys.identityPublicKey,
            signature: keys.signature,
            keyEpoch: keys.keyEpoch || 1,
            allowRotation: forceRotate
          })
        });
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
