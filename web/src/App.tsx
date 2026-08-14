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
import OutreachEngine from './pages/OutreachEngine';
import AdminDashboard from './pages/AdminDashboard';
import AdminAudit from './pages/AdminAudit';
import AdminKnowledge from './pages/AdminKnowledge';
import AdminLearning from './pages/AdminLearning';
import AdminAIReliability from './pages/AdminAIReliability';
import ManagerDashboard from './pages/ManagerDashboard';
import DemoCabinet from './pages/DemoCabinet';
import DemoAILeads from './pages/DemoAILeads';
import DemoConversationAnalysis from './pages/DemoConversationAnalysis';
import ProjectsList from './pages/ProjectsList';
import { Decisions } from './pages/Decisions';
import { Crm } from './pages/Crm';
import { SystemHealth } from './pages/SystemHealth';
import { MailBrief } from './pages/MailBrief';
import { Inbound } from './pages/Inbound';
import PersonalManager from './pages/PersonalManager';
import InvestorPortfolio from './pages/InvestorPortfolio';
import OpportunityDetail from './pages/OpportunityDetail';

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

      {/* Sprint 63.P1 - очередь решений владельца. Только SUPER_ADMIN: это его
          личная очередь, в карточках лежат PII контактов. */}
      <Route path="/decide" element={<RequireRole roles={['SUPER_ADMIN']}><Decisions /></RequireRole>} />
      {/* Sprint 63.P12 - CRM владельца из telegram-agent, тот же мост и гейт. */}
      <Route path="/crm" element={<RequireRole roles={['SUPER_ADMIN']}><Crm /></RequireRole>} />
      {/* Sprint 63.P4 - четыре аудита одним экраном вместо четырех утренних пушей. */}
      <Route path="/system" element={<RequireRole roles={['SUPER_ADMIN']}><SystemHealth /></RequireRole>} />
      {/* Sprint 63.P7 - утренний почтовый бриф вместо пуша в 10:00. */}
      <Route path="/mail" element={<RequireRole roles={['SUPER_ADMIN']}><MailBrief /></RequireRole>} />
      {/* Sprint 63.P9 - состояние входящих; пуши остаются, экран дополняет. */}
      <Route path="/inbound" element={<RequireRole roles={['SUPER_ADMIN']}><Inbound /></RequireRole>} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/projects" element={<RequireAuth><ProjectsList /></RequireAuth>} />
      <Route path="/projects/new" element={<RequireAuth><NewProject /></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><ProjectCockpit /></RequireAuth>} />
      <Route path="/projects/:id/upload" element={<RequireAuth><ProjectUpload /></RequireAuth>} />
      <Route path="/projects/:id/brief" element={<RequireAuth><ProjectBrief /></RequireAuth>} />
      <Route path="/projects/:id/interview" element={<RequireAuth><ProjectInterview /></RequireAuth>} />
      <Route path="/projects/:id/packaging" element={<RequireAuth><ProjectPackaging /></RequireAuth>} />
      <Route path="/projects/:id/prompts" element={<RequireAuth><ProjectPrompts /></RequireAuth>} />
      <Route path="/projects/:id/documents" element={<RequireAuth><ProjectDocuments /></RequireAuth>} />
      <Route path="/projects/:id/review" element={<RequireAuth><ProjectReview /></RequireAuth>} />
      <Route path="/templates" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><Templates /></RequireRole>} />
      {/* Sprint 25 — INVESTOR routes. Sprint 62.P11 — крауд-витрина. */}
      <Route path="/opportunities" element={<RequireAuth><InvestorPortfolio /></RequireAuth>} />
      {/* Sprint 62.P11 — инвестор-facing страница сделки (НЕ ProjectCockpit).
          Объявлена ДО других /opportunities/* и отдельно от /projects/:id, чтобы
          инвестор не попадал во внутренний cockpit. */}
      <Route path="/opportunities/:id" element={<RequireAuth><OpportunityDetail /></RequireAuth>} />
      <Route path="/portfolio" element={<RequireAuth><InvestorPortfolio /></RequireAuth>} />
      <Route path="/secondary" element={<RequireAuth><InvestorPortfolio /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><InvestorPortfolio /></RequireAuth>} />
      <Route path="/guide" element={<RequireAuth><Guide /></RequireAuth>} />
      <Route path="/demo" element={<RequireAuth><DemoCabinet /></RequireAuth>} />
      <Route path="/demo/ai-leads" element={<RequireAuth><DemoAILeads /></RequireAuth>} />
      <Route path="/demo/conversations" element={<RequireAuth><DemoConversationAnalysis /></RequireAuth>} />
      <Route path="/personal-manager" element={<RequireAuth><PersonalManager /></RequireAuth>} />
      <Route path="/ai-leads" element={<RequireAuth><AILeads /></RequireAuth>} />
      {/* Sprint 62.P13 — AI Outreach Engine (демо, mock-only). Под AI-лиды. */}
      <Route path="/ai-leads/outreach" element={<RequireAuth><OutreachEngine /></RequireAuth>} />
      <Route path="/sales-assistant" element={<RequireAuth><SalesAssistant /></RequireAuth>} />
      <Route path="/meetings" element={<RequireAuth><Meetings /></RequireAuth>} />
      <Route path="/conversation-analysis" element={<RequireAuth><ConversationAnalysis /></RequireAuth>} />
      <Route path="/manager" element={<RequireRole roles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}><ManagerDashboard /></RequireRole>} />
      <Route path="/manager/:view" element={<RequireRole roles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}><ManagerDashboard /></RequireRole>} />
      <Route path="/admin" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/users" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/leads" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/materials" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/settings" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/projects" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/invites" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/audit" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}><AdminAudit /></RequireRole>} />
      {/* Sprint 39 — База знаний AI-продаж. MANAGER тоже допускается:
          менеджеры команды загружают свои скрипты, кейсы, объекции. */}
      <Route path="/admin/knowledge" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><AdminKnowledge /></RequireRole>} />
      {/* Sprint 44 — Learning Dashboard. Доступ как у KB: manager тоже допускается. */}
      <Route path="/admin/learning" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><AdminLearning /></RequireRole>} />
      <Route path="/admin/ai-reliability" element={<RequireRole roles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}><AdminAIReliability /></RequireRole>} />
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
