import { Navigate, Route, Routes } from 'react-router-dom';
import { getAuth } from './lib/auth';
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
import AdminProjects from './pages/AdminProjects';
import Guide from './pages/Guide';
import SalesAssistant from './pages/SalesAssistant';

export default function App() {
  const auth = getAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={auth ? '/dashboard' : '/login'} replace />} />
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
      <Route path="/templates" element={<Templates />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/sales-assistant" element={<SalesAssistant />} />
      <Route path="/admin/projects" element={<AdminProjects />} />
      <Route path="*" element={<Navigate to={auth ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
