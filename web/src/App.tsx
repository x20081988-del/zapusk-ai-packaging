import { Navigate, Route, Routes } from 'react-router-dom';
import { defaultRouteForRole, getAuth, type UserRole } from './lib/auth';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectCockpit from './pages/ProjectCockpit';
import ProjectBrief from './pages/ProjectBrief';
import ProjectUpload from './pages/ProjectUpload';
import ProjectInterview from './pages/ProjectInterview';
import ProjectPackaging from './pages/ProjectPackaging';
import ProjectPrompts from './pages/ProjectPrompts';
import ProjectDocuments from './pages/ProjectDocuments';
import ProjectReview from './pages/ProjectReview';
import Templates from './pages/Templates';
import Guide from './pages/Guide';
import SalesAssistant from './pages/SalesAssistant';
import Meetings from './pages/Meetings';
import ConversationAnalysis from './pages/ConversationAnalysis';
import AILeads from './pages/AILeads';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import DemoCabinet from './pages/DemoCabinet';
import PersonalManager from './pages/PersonalManager';

export default function App() {
  const auth = getAuth();
  const home = auth ? defaultRouteForRole(auth.role) : '/login';

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      {/* Sprint 19: публичные роуты — /login, /signup. Всё остальное под
          RequireAuth (защита локально через getAuth + redirect на /login). */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/projects/new" element={<RequireAuth><NewProject /></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><ProjectCockpit /></RequireAuth>} />
      <Route path="/projects/:id/upload" element={<RequireAuth><ProjectUpload /></RequireAuth>} />
      <Route path="/projects/:id/brief" element={<RequireAuth><ProjectBrief /></RequireAuth>} />
      <Route path="/projects/:id/interview" element={<RequireAuth><ProjectInterview /></RequireAuth>} />
      <Route path="/projects/:id/packaging" element={<RequireAuth><ProjectPackaging /></RequireAuth>} />
      <Route path="/projects/:id/prompts" element={<RequireAuth><ProjectPrompts /></RequireAuth>} />
      <Route path="/projects/:id/documents" element={<RequireAuth><ProjectDocuments /></RequireAuth>} />
      <Route path="/projects/:id/review" element={<RequireAuth><ProjectReview /></RequireAuth>} />
      <Route path="/templates" element={<RequireRole roles={['admin']}><Templates /></RequireRole>} />
      <Route path="/guide" element={<RequireAuth><Guide /></RequireAuth>} />
      <Route path="/demo" element={<RequireAuth><DemoCabinet /></RequireAuth>} />
      <Route path="/personal-manager" element={<RequireAuth><PersonalManager /></RequireAuth>} />
      <Route path="/ai-leads" element={<RequireAuth><AILeads /></RequireAuth>} />
      <Route path="/sales-assistant" element={<RequireAuth><SalesAssistant /></RequireAuth>} />
      <Route path="/meetings" element={<RequireAuth><Meetings /></RequireAuth>} />
      <Route path="/conversation-analysis" element={<RequireAuth><ConversationAnalysis /></RequireAuth>} />
      <Route path="/manager" element={<RequireRole roles={['manager', 'admin']}><ManagerDashboard /></RequireRole>} />
      <Route path="/manager/:view" element={<RequireRole roles={['manager', 'admin']}><ManagerDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/leads" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/materials" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/settings" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/projects" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/invites" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

// Sprint 19: общая защита маршрутов — простая проверка наличия auth state.
// Реальная валидация токена на каждом API-вызове происходит на бэкенде
// (authMiddleware → 401 → AppLayout всё равно redirect'нет на /login).
function RequireAuth({ children }: { children: JSX.Element }) {
  const auth = getAuth();
  if (!auth) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: JSX.Element }) {
  const auth = getAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (!roles.includes(auth.role)) return <Navigate to={defaultRouteForRole(auth.role)} replace />;
  return children;
}
