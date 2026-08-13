import { createContext, useContext } from "react";

export type FeedbackKind = "success" | "error" | "info";

export interface FeedbackContextValue {
  notify: (message: string, kind?: FeedbackKind) => void;
}

export const FeedbackContext = createContext<FeedbackContextValue | undefined>(
  undefined,
);

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context)
    throw new Error("useFeedback must be used within FeedbackProvider");
  return context;
}
