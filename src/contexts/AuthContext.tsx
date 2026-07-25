import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import * as Keychain from "react-native-keychain";
import { supabase } from "../lib/supabase";

export interface Account {
  id: string;
  full_name: string;
  role: "user" | "manager" | "administrator";
  must_change_password: boolean;
  identifier: string;
  token: string;
}

interface AuthState {
  account: Account | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateAccount: (updates: Partial<Account>) => void;
  forceSetPassword: (currentPass: string, newPass: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccount() {
      try {
        const credentials = await Keychain.getGenericPassword();
        if (credentials && credentials.password) {
          const storedAccount = JSON.parse(credentials.password) as Account;
          
          // Verify session token on startup
          const { data, error } = await supabase.rpc("platform_verify_session", {
            p_token: storedAccount.token,
          });

          const result = data as any;
          if (error || !result || !result.valid) {
            console.warn("Session invalid or expired, clearing Keychain");
            await Keychain.resetGenericPassword();
            setAccount(null);
          } else {
            setAccount(storedAccount);
          }
        } else {
          setAccount(null);
        }
      } catch (err) {
        console.error("Failed to load account from Keychain", err);
        setAccount(null);
      } finally {
        setLoading(false);
      }
    }
    loadAccount();
  }, []);

  const saveAccount = async (acct: Account | null) => {
    try {
      if (acct) {
        await Keychain.setGenericPassword("platform_account", JSON.stringify(acct));
      } else {
        await Keychain.resetGenericPassword();
      }
    } catch (err) {
      console.error("Failed to save account to Keychain", err);
    }
  };

  const signIn = useCallback(async (identifier: string, password: string) => {
    const { data, error } = await supabase.rpc("platform_login", {
      p_identifier: identifier,
      p_password: password,
    });

    if (error) return { error: error.message };

    const result = data as Record<string, unknown>;
    if (!result.ok) return { error: (result.error as string) || "Login failed" };

    const acct: Account = {
      id: result.id as string,
      full_name: result.full_name as string,
      role: result.role as Account["role"],
      must_change_password: result.must_change_password as boolean,
      identifier: result.identifier as string,
      token: result.token as string,
    };

    setAccount(acct);
    await saveAccount(acct);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (account?.token) {
      try {
        // Explicitly clear session on backend
        await supabase.rpc("platform_logout", { p_token: account.token });
      } catch (err) {
        console.error("Sign out RPC Error:", err);
      }
    }
    setAccount(null);
    await saveAccount(null);
  }, [account]);

  const updateAccount = useCallback((updates: Partial<Account>) => {
    setAccount((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      saveAccount(next);
      return next;
    });
  }, []);

  const forceSetPassword = useCallback(async (currentPass: string, newPass: string) => {
    if (!account?.token) return { error: "No active session token" };

    const { data, error } = await supabase.rpc("platform_force_set_password", {
      p_token: account.token,
      p_current_password: currentPass,
      p_new_password: newPass,
    });

    if (error) return { error: error.message };

    const result = data as any;
    if (!result || !result.ok) {
      return { error: result?.error || "Failed to update password" };
    }

    // Update local state to reflect password change
    updateAccount({ must_change_password: false });
    return { error: null };
  }, [account, updateAccount]);

  return (
    <AuthContext.Provider value={{ account, loading, signIn, signOut, updateAccount, forceSetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
