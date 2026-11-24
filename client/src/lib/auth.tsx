import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { authAPI, type User } from "./api";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; role?: string; phone?: string }) => Promise<void>;
  registerOwner: (data: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  updateProfile: (data: {
    name?: string;
    email?: string;
    phone?: string;
    studentId?: string;
    avatar?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateWallet: (balance: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("foodflow_session") || "null");
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("foodflow_token"));
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.getProfile();
      setUser(res.data.user);
      localStorage.setItem("foodflow_session", JSON.stringify(res.data.user));
    } catch {
      setUser(null);
      setToken(null);
      localStorage.removeItem("foodflow_session");
      localStorage.removeItem("foodflow_token");
    }
  }, []);

  useEffect(() => {
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, refreshUser]);

  const persistSession = (nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("foodflow_token", nextToken);
    localStorage.setItem("foodflow_session", JSON.stringify(nextUser));
  };

  const login = async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    persistSession(res.data.token, res.data.user);
  };

  const register = async (data: { name: string; email: string; password: string; role?: string; phone?: string }) => {
    const res = await authAPI.register(data);
    persistSession(res.data.token, res.data.user);
  };

  const registerOwner = async (data: { name: string; email: string; password: string; phone?: string }) => {
    const res = await authAPI.registerOwner(data);
    persistSession(res.data.token, res.data.user);
  };

  const updateProfile = async (data: {
    name?: string;
    email?: string;
    phone?: string;
    studentId?: string;
    avatar?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    const res = await authAPI.updateProfile(data);
    setUser(res.data.user);
    localStorage.setItem("foodflow_session", JSON.stringify(res.data.user));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("foodflow_session");
    localStorage.removeItem("foodflow_token");
    localStorage.removeItem("foodflow_selected_canteen");
  };

  const updateWallet = (balance: number) => {
    if (user) {
      const updated = { ...user, walletBalance: balance };
      setUser(updated);
      localStorage.setItem("foodflow_session", JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, registerOwner, updateProfile, logout, refreshUser, updateWallet }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
