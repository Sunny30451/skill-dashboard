import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppData } from "./app-data";
import { AuthContext, type AuthContextValue } from "./auth";
import {
  backendChangePassword,
  backendLogin,
  backendLogout,
  backendRegister,
  backendSession,
  backendSetUserPassword,
  isBackendEnabled,
} from "../services/backend";
import type { User } from "../types";

const SESSION_KEY = "campaignhub-session";
const CREDENTIALS_KEY = "campaignhub-credentials";
const DEMO_PASSWORD = "demo123";
const DEMO_USER_IDS = new Set(["1", "2", "3", "4"]);

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readCredentialHashes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) ?? "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { users, createUser, deleteUser } = useAppData();
  const [backendEnabled, setBackendEnabled] = useState(false);
  const [backendUser, setBackendUser] = useState<User | null>(null);
  const [backendLoading, setBackendLoading] = useState(true);
  const [sessionUserId, setSessionUserId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  const localUser =
    users.find((candidate) => candidate.id === sessionUserId) ?? null;
  const user = backendEnabled ? backendUser : localUser;
  const isLoading =
    backendLoading || (!backendEnabled && Boolean(sessionUserId && !localUser));

  useEffect(() => {
    let cancelled = false;
    void isBackendEnabled()
      .then(async (enabled) => {
        if (cancelled) return;
        setBackendEnabled(enabled);
        if (enabled) {
          const sessionUser = await backendSession();
          if (!cancelled) setBackendUser(sessionUser);
        }
      })
      .catch(() => {
        if (!cancelled) setBackendEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setBackendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendEnabled || !sessionUserId || localUser) return undefined;
    // App data and session are separate storage records. Another tab can
    // receive the session event just before the user record; give the domain
    // store a short reconciliation window before treating it as orphaned.
    const orphanTimer = window.setTimeout(() => {
      if (localStorage.getItem(SESSION_KEY) === sessionUserId) {
        localStorage.removeItem(SESSION_KEY);
      }
      setSessionUserId((current) =>
        current === sessionUserId ? null : current,
      );
    }, 1000);
    return () => window.clearTimeout(orphanTimer);
  }, [backendEnabled, localUser, sessionUserId]);

  useEffect(() => {
    const hashes = readCredentialHashes();
    const userIds = new Set(users.map((candidate) => candidate.id));
    const retainedHashes = Object.fromEntries(
      Object.entries(hashes).filter(([id]) => userIds.has(id)),
    );
    if (Object.keys(retainedHashes).length !== Object.keys(hashes).length) {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(retainedHashes));
    }
  }, [users]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) setSessionUserId(event.newValue);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      canEdit: Boolean(user && user.role !== "Visitor"),
      isAdmin: user?.role === "Admin",
      isServerMode: backendEnabled,
      login: async (email, password) => {
        if (backendEnabled) {
          try {
            setBackendUser(await backendLogin(email, password));
            return true;
          } catch {
            return false;
          }
        }
        const normalizedEmail = email.trim().toLowerCase();
        const foundUser = users.find(
          (candidate) => candidate.email.toLowerCase() === normalizedEmail,
        );
        if (!foundUser || !password) return false;
        const hashes = readCredentialHashes();
        const enteredHash = await hashPassword(password);
        const expectedHash =
          hashes[foundUser.id] ??
          (DEMO_USER_IDS.has(foundUser.id)
            ? await hashPassword(DEMO_PASSWORD)
            : null);
        if (!expectedHash) return false;
        if (enteredHash !== expectedHash) return false;
        localStorage.setItem(SESSION_KEY, foundUser.id);
        setSessionUserId(foundUser.id);
        return true;
      },
      logout: () => {
        if (backendEnabled) {
          void backendLogout().finally(() => setBackendUser(null));
          return;
        }
        localStorage.removeItem(SESSION_KEY);
        setSessionUserId(null);
      },
      register: async (email, name, role, password) => {
        if (backendEnabled) {
          try {
            setBackendUser(
              await backendRegister({ email, name, role, password }),
            );
            return true;
          } catch {
            return false;
          }
        }
        const normalizedEmail = email.trim().toLowerCase();
        if (
          !normalizedEmail ||
          !name.trim() ||
          password.length < 6 ||
          role === "Admin" ||
          users.some(
            (candidate) => candidate.email.toLowerCase() === normalizedEmail,
          )
        )
          return false;
        const passwordHash = await hashPassword(password);
        const newUser = createUser({
          email: normalizedEmail,
          name: name.trim(),
          role,
        });
        const hashes = readCredentialHashes();
        hashes[newUser.id] = passwordHash;
        try {
          localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(hashes));
          localStorage.setItem(SESSION_KEY, newUser.id);
        } catch (error) {
          deleteUser(newUser.id);
          delete hashes[newUser.id];
          try {
            localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(hashes));
          } catch {
            // The UI reports the original storage failure.
          }
          localStorage.removeItem(SESSION_KEY);
          throw error;
        }
        setSessionUserId(newUser.id);
        return true;
      },
      changePassword: async (password) => {
        if (backendEnabled) {
          await backendChangePassword(password);
          return;
        }
        if (!user || password.length < 6)
          throw new Error("Das Passwort muss mindestens 6 Zeichen lang sein.");
        const hashes = readCredentialHashes();
        hashes[user.id] = await hashPassword(password);
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(hashes));
      },
      setUserPassword: async (userId, password) => {
        if (backendEnabled) {
          if (user?.role !== "Admin")
            throw new Error(
              "Nur Admins können Passwörter anderer Nutzer setzen.",
            );
          await backendSetUserPassword(userId, password);
          return;
        }
        if (user?.role !== "Admin")
          throw new Error(
            "Nur Admins können Passwörter anderer Nutzer setzen.",
          );
        if (password.length < 6)
          throw new Error("Das Passwort muss mindestens 6 Zeichen lang sein.");
        const hashes = readCredentialHashes();
        hashes[userId] = await hashPassword(password);
        localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(hashes));
      },
    }),
    [backendEnabled, createUser, deleteUser, isLoading, user, users],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
