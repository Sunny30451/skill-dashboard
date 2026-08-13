import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Target, 
  Users, 
  FileText, 
  Settings, 
  UserCircle, 
  LogOut,
  Menu,
  X,
  MessageSquare,
  FolderOpen,
  Bot,
  PlayCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
}

const Navigation: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/campaigns', label: 'Kampagnen', icon: <Target size={20} /> },
    { path: '/social-stream', label: 'Social Stream', icon: <PlayCircle size={20} /> },
    { path: '/media-library', label: 'Mediathek', icon: <FolderOpen size={20} /> },
    { path: '/tasks', label: 'Aufgaben', icon: <FileText size={20} /> },
    { path: '/agents', label: 'Agent Workflows', icon: <Bot size={20} /> },
    { path: '/participants', label: 'Beteiligte', icon: <Users size={20} /> },
    { 
      path: '/admin', 
      label: 'Admin', 
      icon: <Settings size={20} />,
      roles: ['Admin']
    },
    { path: '/profile', label: 'Profil', icon: <UserCircle size={20} /> },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-gray-900 text-white">
        <div className="flex items-center h-16 px-6 bg-gray-800">
          <Target className="h-8 w-8 text-blue-500" />
          <span className="ml-3 text-lg font-bold">CampaignHub</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="ml-3">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 bg-gray-800">
          <button
            onClick={logout}
            className="flex items-center w-full px-4 py-3 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
          >
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>
          
          {user && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-center">
                <img
                  src={user.avatar || 'https://i.pravatar.cc/150'}
                  alt={user.name}
                  className="w-10 h-10 rounded-full"
                />
                <div className="ml-3">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-gray-400">{user.role}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-gray-900 text-white z-50">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center">
            <Target className="h-8 w-8 text-blue-500" />
            <span className="ml-3 text-lg font-bold">CampaignHub</span>
          </div>
          
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-800"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-gray-900 z-40 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="ml-3">{item.label}</span>
              </Link>
            ))}
            
            <button
              onClick={() => {
                logout();
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center w-full px-4 py-3 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <LogOut size={20} />
              <span className="ml-3">Logout</span>
            </button>
            
            {user && (
              <div className="mt-4 pt-4 border-t border-gray-800 px-4">
                <div className="flex items-center">
                  <img
                    src={user.avatar || 'https://i.pravatar.cc/150'}
                    alt={user.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="ml-3">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-gray-400">{user.role}</p>
                  </div>
                </div>
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
};

export default Navigation;
