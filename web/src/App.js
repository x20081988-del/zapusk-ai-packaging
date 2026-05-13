import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from 'react-router-dom';
import { defaultRouteForRole, getAuth } from './lib/auth';
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
import AILeads from './pages/AILeads';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import DemoCabinet from './pages/DemoCabinet';
import PersonalManager from './pages/PersonalManager';
export default function App() {
    const auth = getAuth();
    const home = auth ? defaultRouteForRole(auth.role) : '/login';
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: home, replace: true }) }), _jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/projects/new", element: _jsx(NewProject, {}) }), _jsx(Route, { path: "/projects/:id", element: _jsx(ProjectCockpit, {}) }), _jsx(Route, { path: "/projects/:id/upload", element: _jsx(ProjectUpload, {}) }), _jsx(Route, { path: "/projects/:id/brief", element: _jsx(ProjectBrief, {}) }), _jsx(Route, { path: "/projects/:id/interview", element: _jsx(ProjectInterview, {}) }), _jsx(Route, { path: "/projects/:id/packaging", element: _jsx(ProjectPackaging, {}) }), _jsx(Route, { path: "/projects/:id/prompts", element: _jsx(ProjectPrompts, {}) }), _jsx(Route, { path: "/projects/:id/documents", element: _jsx(ProjectDocuments, {}) }), _jsx(Route, { path: "/projects/:id/review", element: _jsx(ProjectReview, {}) }), _jsx(Route, { path: "/templates", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(Templates, {}) }) }), _jsx(Route, { path: "/guide", element: _jsx(Guide, {}) }), _jsx(Route, { path: "/demo", element: _jsx(DemoCabinet, {}) }), _jsx(Route, { path: "/personal-manager", element: _jsx(PersonalManager, {}) }), _jsx(Route, { path: "/ai-leads", element: _jsx(AILeads, {}) }), _jsx(Route, { path: "/sales-assistant", element: _jsx(SalesAssistant, {}) }), _jsx(Route, { path: "/manager", element: _jsx(RequireRole, { roles: ['manager', 'admin'], children: _jsx(ManagerDashboard, {}) }) }), _jsx(Route, { path: "/manager/:view", element: _jsx(RequireRole, { roles: ['manager', 'admin'], children: _jsx(ManagerDashboard, {}) }) }), _jsx(Route, { path: "/admin", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "/admin/users", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "/admin/leads", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "/admin/materials", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "/admin/settings", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "/admin/projects", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(AdminDashboard, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: home, replace: true }) })] }));
}
function RequireRole({ roles, children }) {
    const auth = getAuth();
    if (!auth)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (!roles.includes(auth.role))
        return _jsx(Navigate, { to: defaultRouteForRole(auth.role), replace: true });
    return children;
}
