import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navigation from './components/Navigation';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import SocialStream from './pages/SocialStream';
import MediaLibrary from './pages/MediaLibrary';
import Tasks from './pages/Tasks';
import Agents from './pages/Agents';
import Participants from './pages/Participants';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import './index.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return (
    <div className="min-h-screen bg-gray-900">
      <Navigation />
      <main className="pt-16 md:pt-0">{children}</main>
    </div>
  );
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
          <Route path="/social-stream" element={<ProtectedRoute><SocialStream /></ProtectedRoute>} />
          <Route path="/media-library" element={<ProtectedRoute><MediaLibrary /></ProtectedRoute>} />
          <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
          <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
          <Route path="/participants" element={<ProtectedRoute><Participants /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
