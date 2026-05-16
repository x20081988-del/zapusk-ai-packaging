import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  loading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-warning/30 bg-warning/10 text-warning">
            <AlertTriangle size={16} />
          </div>
          <div className="text-sm leading-relaxed text-secondary">{description}</div>
        </div>
      </div>
      <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-hairline bg-elevated px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
        <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
          {cancelLabel}
        </Button>
        <Button type="button" variant="danger" onClick={onConfirm} loading={loading} className="w-full sm:w-auto">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
