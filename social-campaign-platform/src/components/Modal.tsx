import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const overlay = overlayRef.current;
    const siblings = overlay?.parentElement
      ? Array.from(overlay.parentElement.children).filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element !== overlay,
        )
      : [];
    const siblingState = siblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    siblings.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    const focusTimer = window.setTimeout(() => {
      const firstFocusable =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panelRef.current?.querySelector<HTMLElement>(
          "form input:not(:disabled), form select:not(:disabled), form textarea:not(:disabled), form button:not(:disabled)",
        ) ??
        panelRef.current?.querySelector<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        );
      firstFocusable?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      siblingState.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      previousActive?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 shadow-2xl ${sizes[size]}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-4">
          <h2 id={titleId} className="text-xl font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
