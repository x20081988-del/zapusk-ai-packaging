import { Navigate, Route, Routes } from 'react-router-dom';
import { defaultRouteForRole, getAuth, type UserRole } from './lib/auth';
import Login from './pages/Login';
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
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/projects/new" element={<NewProject />} />
      <Route path="/projects/:id" element={<ProjectCockpit />} />
      <Route path="/projects/:id/upload" element={<ProjectUpload />} />
      <Route path="/projects/:id/brief" element={<ProjectBrief />} />
      <Route path="/projects/:id/interview" element={<ProjectInterview />} />
      <Route path="/projects/:id/packaging" element={<ProjectPackaging />} />
      <Route path="/projects/:id/prompts" element={<ProjectPrompts />} />
      <Route path="/projects/:id/documents" element={<ProjectDocuments />} />
      <Route path="/projects/:id/review" element={<ProjectReview />} />
      <Route path="/templates" element={<RequireRole roles={['admin']}><Templates /></RequireRole>} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/demo" element={<DemoCabinet />} />
      <Route path="/personal-manager" element={<PersonalManager />} />
      <Route path="/ai-leads" element={<AILeads />} />
      <Route path="/sales-assistant" element={<SalesAssistant />} />
      <Route path="/meetings" element={<Meetings />} />
      <Route path="/manager" element={<RequireRole roles={['manager', 'admin']}><ManagerDashboard /></RequireRole>} />
      <Route path="/manager/:view" element={<RequireRole roles={['manager', 'admin']}><ManagerDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/leads" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/materials" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/settings" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/projects" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: JSX.Element }) {
  const auth = getAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (!roles.includes(auth.role)) return <Navigate to={defaultRouteForRole(auth.role)} replace />;
  return children;
}
