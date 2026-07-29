import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserProfile,
  ApiKey,
  registerUserApi,
  loginUserApi,
  logoutUserApi,
  fetchCurrentProfileApi,
  fetchApiKeysApi,
  createApiKeyApi,
  revokeApiKeyApi,
} from '../services/authApi';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (agentId: string, password: string) => Promise<void>;
  register: (email: string, password: string, agentName?: string, agentId?: string) => Promise<{ verificationToken?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  apiKeys: ApiKey[];
  fetchApiKeys: () => Promise<void>;
  createApiKey: (agentName: string) => Promise<{ key: ApiKey; secretKey: string }>;
  revokeApiKey: (keyId: string) => Promise<void>;
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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      const profile = await fetchCurrentProfileApi();
      setUser(profile);
      if (typeof window !== 'undefined') {
        if (profile) {
          localStorage.setItem('aamarva_user', JSON.stringify(profile));
        } else {
          localStorage.removeItem('aamarva_user');
        }
      }
    } catch (err) {
      // Do NOT set user to null on silent refresh errors to prevent forced logout!
      console.warn('Profile sync failed, keeping local session:', err);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const keys = await fetchApiKeysApi();
      setApiKeys(keys);
    } catch (err) {
      setApiKeys([]);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      // Attempt silent profile restoration via HttpOnly cookie or localStorage token
      await refreshProfile();
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (agentId: string, password: string) => {
    const result = await loginUserApi({ agentId, password });
    const userToSave = result.user || result.data?.user;
    setUser(userToSave || null);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
    await fetchApiKeys();
  };

  const register = async (email: string, password: string, agentName?: string, agentId?: string) => {
    // Interactive UI registrations auto-verify for instant operator access
    const result = await registerUserApi({ email, password, agentName, agentId, autoVerify: true });
    const userToSave = result.user || result.data?.user;
    setUser(userToSave || null);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
      } else {
        localStorage.removeItem('aamarva_user');
      }
    }
    await fetchApiKeys();
    return { verificationToken: result.verificationToken };
  };

  const logout = async () => {
    await logoutUserApi();
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
    }
    setApiKeys([]);
  };

  const createApiKey = async (agentName: string) => {
    const result = await createApiKeyApi(agentName);
    await fetchApiKeys();
    return result;
  };

  const revokeApiKey = async (keyId: string) => {
    await revokeApiKeyApi(keyId);
    await fetchApiKeys();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
        apiKeys,
        fetchApiKeys,
        createApiKey,
        revokeApiKey,
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
