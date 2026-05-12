import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="w-14 h-14 mb-4 rounded-full bg-surface border border-line flex items-center justify-center text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-primary mb-1.5">{title}</h3>
      {description && <p className="text-sm text-secondary max-w-md">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
