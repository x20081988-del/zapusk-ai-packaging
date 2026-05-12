import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { getAuth } from '../../lib/auth';

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, action, children }: Props) {
  const auth = getAuth();
  if (!auth) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} action={action} />
        <main className="flex-1 px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-content mx-auto animate-rise">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
