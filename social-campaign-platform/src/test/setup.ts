import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

configure({ asyncUtilTimeout: 10_000 });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: () => undefined,
    writable: true,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});
