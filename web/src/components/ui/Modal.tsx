import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
  bodyClassName?: string;
}

export function Modal({ open, onClose, title, children, width = 'max-w-2xl', bodyClassName }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'relative flex max-h-[85vh] w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-line bg-elevated shadow-lifted',
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4 border-b border-hairline">
            <h2 className="text-base font-semibold text-primary">{title}</h2>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className="w-8 h-8 rounded-md inline-flex items-center justify-center text-muted hover:text-primary hover:bg-surface transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className={clsx('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
