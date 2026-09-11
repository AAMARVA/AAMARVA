import React, { createContext, useContext, useState, useEffect } from 'react';
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

  
  const ensureE2EEKeys = async (agentId: string, forceRotate: boolean = false, credential?: string) => {
    if (typeof window === 'undefined' || !agentId) return;
    try {
      const activeCredential = credential || userPassword;
      let keys = await getLocalKeyPair(agentId, undefined, activeCredential || undefined);
      const isCompleteKey = !!(keys && keys.publicKey && keys.privateKey && keys.identityPublicKey && keys.signature);

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

      if (keys) {
        // Publish public key and identity binding to server with authorized rotation when explicitly requested
        await apiFetch('/api/agents/me/e2ee', {
          method: 'PUT',
          authType: 'human',
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
    const userToSave = result.user || result.data?.user || result;
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
