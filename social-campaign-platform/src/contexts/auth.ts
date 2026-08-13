import { createContext, useContext } from "react";
import type { User, UserRole } from "../types";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  isServerMode: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (
    email: string,
    name: string,
    role: UserRole,
    password: string,
  ) => Promise<boolean>;
  changePassword: (password: string) => Promise<void>;
  setUserPassword: (userId: string, password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
