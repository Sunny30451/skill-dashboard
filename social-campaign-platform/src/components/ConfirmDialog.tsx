import Modal from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestätigen",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="mb-6 text-gray-300">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-lg px-4 py-2 text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
