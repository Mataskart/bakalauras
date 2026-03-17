import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Contacts from './pages/Contacts';

const History = lazy(() => import('./pages/History'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="contacts" element={<Contacts />} />
            <Route
              path="history"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
                    <History />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="leaderboard"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
                    <Leaderboard />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
