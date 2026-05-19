import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { 
  LayoutDashboard, 
  Receipt, 
  PieChart, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Wallet,
  ChevronDown,
  User,
  Target,
  Flag,
  Download,
  Moon,
  Sun
} from 'lucide-react';
import { Avatar, Button } from './ui';

export default function Layout({ children }) {
  const { user, logout, isGuest } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Transactions', href: '/transactions', icon: Receipt },
    { name: 'Budgets', href: '/budgets', icon: Target },
    { name: 'Goals', href: '/goals', icon: Flag },
    { name: 'Analytics', href: '/analytics', icon: PieChart },
    { name: 'Export', href: '/export', icon: Download },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (href) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-page">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-border-color
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border-color">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <Wallet className="w-6 h-6 text-brand-primary" />
            </div>
            <span className="text-xl font-bold font-heading text-text-primary">
              SAVIQ
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                    transition-all duration-200
                    ${active 
                      ? 'bg-brand-primary text-white shadow-sm' 
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }
                  `}
                  data-testid={`nav-${item.name.toLowerCase()}`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-border-color dark:border-gray-700">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium text-text-secondary dark:text-gray-400 hover:bg-surface-hover dark:hover:bg-gray-800 transition-colors mb-2"
              data-testid="dark-mode-toggle"
            >
              <div className="flex items-center gap-3">
                {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors ${darkMode ? 'bg-brand-primary' : 'bg-gray-300'} relative`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${darkMode ? 'left-5' : 'left-1'}`} />
              </div>
            </button>
            
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar name={user?.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary dark:text-white truncate">
                  {user?.name || 'Guest'}
                </p>
                <p className="text-xs text-text-secondary dark:text-gray-400 truncate">
                  {isGuest ? 'Guest Mode' : user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 mt-2 rounded-xl text-sm font-medium text-text-secondary dark:text-gray-400 hover:bg-surface-hover dark:hover:bg-gray-800 hover:text-expense transition-colors"
              data-testid="logout-button"
            >
              <LogOut className="w-5 h-5" />
              {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-page/80 backdrop-blur-xl border-b border-border-color">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-surface-hover lg:hidden"
              data-testid="mobile-menu-button"
            >
              <Menu className="w-6 h-6 text-text-secondary" />
            </button>

            <div className="flex-1 lg:flex-none" />

            {/* User dropdown (desktop) */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors"
                data-testid="user-menu-button"
              >
                <Avatar name={user?.name} size="sm" />
                <span className="hidden sm:block text-sm font-medium text-text-primary">
                  {user?.name || 'Guest'}
                </span>
                <ChevronDown className="w-4 h-4 text-text-secondary" />
              </button>

              {userMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-border-color py-2 z-50 animate-fade-in">
                    <div className="px-4 py-3 border-b border-border-color">
                      <p className="text-sm font-medium text-text-primary">{user?.name}</p>
                      <p className="text-xs text-text-secondary">{user?.email}</p>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-hover"
                    >
                      <User className="w-4 h-4" />
                      Settings
                    </Link>
                    <button
                      onClick={() => { handleLogout(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-expense hover:bg-surface-hover"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
