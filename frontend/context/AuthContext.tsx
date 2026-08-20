"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import api from "@/lib/api";

export interface User {
  id: number;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  isSuperuser: boolean;
  permissions: string[];
  locationId: number | null;
  locationType: "SHOP" | "STORE" | null;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isLoading: boolean;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        // Only restore if the stored user has the new permission shape.
        if (Array.isArray(parsed?.permissions)) {
          setUser(parsed);
        } else {
          localStorage.removeItem("user");
        }
      } catch {
        localStorage.removeItem("user");
      }
    }
    // The session is an HttpOnly cookie; a page reload re-validates it.
    // Refresh the current user + permissions from the server so role
    // changes take effect without requiring a re-login.
    api
      .get("/auth/me")
      .then((res) => {
        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch((err: any) => {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem("user");
          localStorage.removeItem("access_token");
          setUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = (userData: User) => {
    // The session token lives in an HttpOnly cookie set by the backend;
    // it is never written to localStorage.
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    router.push("/dashboard");
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("user");
    localStorage.removeItem("access_token");
    setUser(null);
    router.push("/login");
  };

  const hasPermission = (key: string) => {
    if (!user) return false;
    if (user.isSuperuser) return true;
    return user.permissions.includes(key);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isLoading, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
