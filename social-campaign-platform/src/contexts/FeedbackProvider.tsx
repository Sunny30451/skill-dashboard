import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle, CircleAlert, Info, X } from "lucide-react";
import { FeedbackContext, type FeedbackKind } from "./feedback";

interface Toast {
  id: number;
  kind: FeedbackKind;
  message: string;
}

const icons = {
  success: CheckCircle,
  error: CircleAlert,
  info: Info,
};

const styles = {
  success: "border-green-500/40 bg-green-950/95 text-green-100",
  error: "border-red-500/40 bg-red-950/95 text-red-100",
  info: "border-blue-500/40 bg-blue-950/95 text-blue-100",
};

interface FeedbackProviderProps {
  children: ReactNode;
}

export function FeedbackProvider({ children }: FeedbackProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, kind: FeedbackKind = "success") => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((current) => [...current, { id, kind, message }].slice(-4));
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  useEffect(() => {
    const handlePersistenceError = () =>
      notify(
        "Der lokale Speicher ist voll. Die letzte Änderung bleibt nur bis zum Neuladen erhalten.",
        "error",
      );
    window.addEventListener(
      "campaignhub:persistence-error",
      handlePersistenceError,
    );
    return () =>
      window.removeEventListener(
        "campaignhub:persistence-error",
        handlePersistenceError,
      );
  }, [notify]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 top-20 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 md:top-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.kind];
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur ${styles[toast.kind]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Meldung schließen"
                className="rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}
