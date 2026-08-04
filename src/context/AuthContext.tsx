import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserProfile,
  registerUserApi,
  loginUserApi,
  loginAgentApi,
  logoutUserApi,
  fetchCurrentProfileApi,
  setAccessToken,
  setRefreshToken,
  deleteAccountApi,
} from '../services/authApi';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  userPassword?: string | null;
  login: (agentId: string, credential: string) => Promise<void>;
  loginAgent: (agentId: string, apiKey: string) => Promise<void>;
  register: (email: string, password: string, agentName?: string) => Promise<{ agentId: string; apiKey: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  const [userPassword, setUserPassword] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aamarva_user_password') || null;
    }
    return null;
  });
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

  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('Unauthorized token or deleted user detected. Logging out.');
      setUser(null);
      setUserPassword(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_user_password');
        localStorage.removeItem('aamarva_at');
        localStorage.removeItem('aamarva_rt');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth-unauthorized', handleUnauthorized);
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
      }
    };
  }, []);

  const login = async (agentId: string, credential: string) => {
    const result = await loginUserApi({ agentId, password: credential });
    const userToSave = result.user || result.data?.user || result;
    setUser(userToSave || null);
    setUserPassword(credential);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
        localStorage.setItem('aamarva_user_password', credential);
      } else {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_user_password');
      }
    }
  };

  const loginAgent = async (agentId: string, apiKey: string) => {
    const result = await loginAgentApi({ agentId, apiKey });
    const userToSave = result.user || result.data?.user || result;
    setUser(userToSave || null);
    setUserPassword(apiKey);
    if (typeof window !== 'undefined') {
      if (userToSave) {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
        localStorage.setItem('aamarva_user_password', apiKey);
      } else {
        localStorage.removeItem('aamarva_user');
        localStorage.removeItem('aamarva_user_password');
      }
    }
  };

  const register = async (email: string, password: string, agentName?: string, customAgentId?: string) => {
    const result = await registerUserApi({ 
      email, 
      password, 
      agentName, 
      name: agentName,
      agentId: customAgentId 
    } as any);
    
    const resData = result.data || result;
    const userToSave = resData.user;
    const accessToken = resData.tokens?.accessToken;
    const refreshToken = resData.tokens?.refreshToken;
    
    if (accessToken) {
      setAccessToken(accessToken);
    }
    if (refreshToken) {
      setRefreshToken(refreshToken);
    }

    setUserPassword(password);

    if (userToSave) {
      setUser(userToSave);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aamarva_user', JSON.stringify(userToSave));
        localStorage.setItem('aamarva_user_password', password);
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
    await logoutUserApi();
    setUser(null);
    setUserPassword(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
      localStorage.removeItem('aamarva_user_password');
    }
  };

  const deleteAccount = async () => {
    await deleteAccountApi();
    setUser(null);
    setUserPassword(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aamarva_user');
      localStorage.removeItem('aamarva_user_password');
      localStorage.removeItem('aamarva_at');
      localStorage.removeItem('aamarva_rt');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        userPassword,
        login,
        loginAgent,
        register,
        logout,
        deleteAccount,
        refreshProfile,
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
