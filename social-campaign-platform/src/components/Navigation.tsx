import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
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
  FolderOpen,
  Bot,
  PlayCircle,
  Send,
} from "lucide-react";
import { useAuth } from "../contexts/auth";
import type { UserRole } from "../types";
import Avatar from "./Avatar";

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
  const mobileToggleRef = React.useRef<HTMLButtonElement>(null);
  const mobileMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const main = document.getElementById("main-content");
    const mobileToggle = mobileToggleRef.current;
    const previousInert = main?.inert ?? false;
    if (main) main.inert = true;
    const focusTimer = window.setTimeout(() => {
      mobileMenuRef.current
        ?.querySelector<HTMLElement>("a[href], button:not(:disabled)")
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobileMenuRef.current) return;
      const focusable = [
        mobileToggleRef.current,
        ...Array.from(
          mobileMenuRef.current.querySelectorAll<HTMLElement>(
            "a[href], button:not(:disabled)",
          ),
        ),
      ].filter((element): element is HTMLElement => Boolean(element));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (main) main.inert = previousInert;
      mobileToggle?.focus();
    };
  }, [isMobileMenuOpen]);

  const navItems: NavItem[] = [
    {
      path: "/dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    { path: "/campaigns", label: "Kampagnen", icon: <Target size={20} /> },
    {
      path: "/social-stream",
      label: "Social Stream",
      icon: <PlayCircle size={20} />,
    },
    {
      path: "/publishing",
      label: "Publishing",
      icon: <Send size={20} />,
    },
    {
      path: "/media-library",
      label: "Mediathek",
      icon: <FolderOpen size={20} />,
    },
    { path: "/tasks", label: "Aufgaben", icon: <FileText size={20} /> },
    { path: "/agents", label: "Agent Workflows", icon: <Bot size={20} /> },
    { path: "/participants", label: "Beteiligte", icon: <Users size={20} /> },
    {
      path: "/admin",
      label: "Admin",
      icon: <Settings size={20} />,
      roles: ["Admin"],
    },
    { path: "/profile", label: "Profil", icon: <UserCircle size={20} /> },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  const isActive = (path: string) => {
    return (
      location.pathname === path || location.pathname.startsWith(path + "/")
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden border-r border-gray-800 bg-gray-900 text-white md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <Link
          to="/dashboard"
          className="flex h-16 items-center bg-gray-800 px-6"
          aria-label="CampaignHub Dashboard"
        >
          <Target className="h-8 w-8 text-blue-500" />
          <span className="ml-3 text-lg font-bold">CampaignHub</span>
        </Link>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive(item.path) ? "page" : undefined}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.icon}
              <span className="ml-3">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 bg-gray-800">
          <button
            type="button"
            onClick={logout}
            className="flex items-center w-full px-4 py-3 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
          >
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>

          {user && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex items-center">
                <Avatar
                  src={user.avatar}
                  name={user.name}
                  className="h-10 w-10 rounded-full object-cover"
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
      <header className="fixed left-0 right-0 top-0 z-50 h-16 border-b border-gray-800 bg-gray-900 text-white md:hidden">
        <div className="flex items-center justify-between h-full px-4">
          <Link
            to="/dashboard"
            className="flex items-center"
            aria-label="CampaignHub Dashboard"
          >
            <Target className="h-8 w-8 text-blue-500" />
            <span className="ml-3 text-lg font-bold">CampaignHub</span>
          </Link>

          <button
            ref={mobileToggleRef}
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={
              isMobileMenuOpen ? "Navigation schließen" : "Navigation öffnen"
            }
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-app-navigation"
            className="p-2 rounded-lg hover:bg-gray-800"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-app-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile App-Navigation"
          className="fixed inset-0 top-16 z-40 overflow-y-auto bg-gray-900 md:hidden"
        >
          <nav className="space-y-2 p-4" aria-label="App-Navigation">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                aria-current={isActive(item.path) ? "page" : undefined}
                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {item.icon}
                <span className="ml-3">{item.label}</span>
              </Link>
            ))}

            <button
              type="button"
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
                  <Avatar
                    src={user.avatar}
                    name={user.name}
                    className="h-10 w-10 rounded-full object-cover"
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
