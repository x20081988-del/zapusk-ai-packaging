import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { WorkspaceBanner } from './WorkspaceBanner';
import { getAuth } from '../../lib/auth';

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, action, children }: Props) {
  const auth = getAuth();
  const location = useLocation();
  // Sprint 14: mobile drawer state lives in the layout so every page gets the
  // burger menu without each page wiring it up.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change so navigating from a nav link doesn't leave
  // the overlay hanging. Also handle ESC for accessibility.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (!auth) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar />
      <Sidebar mobile open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} action={action} onOpenMenu={() => setDrawerOpen(true)} />
        {/* Sprint 22: workspace banner для не-active статусов. Рендерится между
            Topbar и контентом — заметно, но не блокирует UX. */}
        <WorkspaceBanner />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-content mx-auto animate-rise">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
