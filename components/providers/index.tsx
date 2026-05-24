"use client";

/**
 * components/providers/index.tsx
 * ──────────────────────────────────────────────
 * Context provider that stores the user's custom GROQ API key in localStorage.
 * The key is read by ChatArea and passed as apiKey in the request body.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

interface ApiKeyContextValue {
  apiKey: string;
  setApiKey: (key: string) => void;
  hasCustomKey: boolean;
  clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextValue>({
  apiKey: "",
  setApiKey: () => {},
  hasCustomKey: false,
  clearApiKey: () => {},
});

const STORAGE_KEY = "llm_logger_api_key";

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState("");

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTimeout(() => {
          setApiKeyState(stored);
        }, 0);
      }
    } catch {
      // localStorage unavailable (SSR / private mode)
    }
  }, []);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({
      apiKey,
      setApiKey,
      hasCustomKey: !!apiKey,
      clearApiKey,
    }),
    [apiKey, setApiKey, clearApiKey]
  );

  return (
    <ApiKeyContext.Provider value={value}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  return useContext(ApiKeyContext);
}
