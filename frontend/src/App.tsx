import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { RequireAuth, RequireRole } from './auth/guards';
import { FullScreenSpinner } from './components/ui';
import { AppLayout } from './layout/AppLayout';
import { AdminPage } from './pages/admin/AdminPage';
import { AssignmentDetailPage } from './pages/AssignmentDetailPage';
import { AssignmentFormPage } from './pages/AssignmentFormPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { ChatsPage } from './pages/chats/ChatsPage';
import { DashboardPage } from './pages/DashboardPage';
import { GradesPage } from './pages/GradesPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { SchedulePage } from './pages/SchedulePage';

export function App() {
  const { user, ready } = useAuth();
  if (!ready) return <FullScreenSpinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route
          path="assignments/new"
          element={
            <RequireRole roles={['TEACHER']}>
              <AssignmentFormPage />
            </RequireRole>
          }
        />
        <Route
          path="assignments/:id/edit"
          element={
            <RequireRole roles={['TEACHER', 'ADMIN']}>
              <AssignmentFormPage />
            </RequireRole>
          }
        />
        <Route path="assignments/:id" element={<AssignmentDetailPage />} />
        <Route path="grades" element={<GradesPage />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="chats/:chatId" element={<ChatsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin/*"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
