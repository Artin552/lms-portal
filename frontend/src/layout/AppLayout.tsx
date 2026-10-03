import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  House,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  Settings2,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import type { Role } from '../api/types';
import { useAuth, useMe } from '../auth/AuthContext';
import { Avatar, IconButton } from '../components/ui';
import { APP_NAME } from '../config';
import { useTheme } from '../theme/ThemeContext';
import { ROLE } from '../utils/format';
import { NotificationBell } from './NotificationBell';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
  badge?: 'unread';
}

const NAV: NavItem[] = [
  { to: '/', label: 'Главная', icon: <House /> },
  { to: '/schedule', label: 'Расписание', icon: <CalendarDays /> },
  { to: '/assignments', label: 'Задания', icon: <BookOpenCheck /> },
  { to: '/grades', label: 'Оценки', icon: <GraduationCap /> },
  { to: '/chats', label: 'Чаты', icon: <MessagesSquare />, badge: 'unread' },
  { to: '/profile', label: 'Профиль', icon: <UserRound /> },
  { to: '/admin', label: 'Админ-панель', icon: <Settings2 />, roles: ['ADMIN'] },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="rgb(var(--accent))" />
        <path d="M8 23 16 8l8 15M11.5 17h9" fill="none" stroke="rgb(var(--on-accent))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight">{APP_NAME}</span>
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const me = useMe();
  const { logout } = useAuth();
  const { data: unread } = useQuery({
    queryKey: ['unread'],
    queryFn: async () => (await api.get<{ total: number }>('/chats/unread-total')).data,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-full flex-col bg-side text-side-ink">
      <div className="px-5 pb-6 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Основное меню">
        {NAV.filter((n) => !n.roles || n.roles.includes(me.role)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px]',
                isActive ? 'bg-white/10 text-white' : 'text-side-ink/70 hover:bg-white/5 hover:text-side-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-accent" />}
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.badge === 'unread' && !!unread?.total && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-accent tabular">
                    {unread.total > 99 ? '99+' : unread.total}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-lg border border-white/10 p-3">
        <div className="flex items-center gap-3">
          <Avatar name={me.fullName} url={me.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{me.shortName}</div>
            <div className="truncate text-xs text-side-ink/60">
              {ROLE[me.role]}
              {me.group && ` · ${me.group.name}`}
            </div>
          </div>
          <button
            onClick={logout}
            aria-label="Выйти"
            title="Выйти"
            className="rounded p-1.5 text-side-ink/60 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chats');

  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[248px] shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-[248px]">
          <Sidebar />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] max-w-[85vw] shadow-2xl">
            <button
              onClick={() => setDrawer(false)}
              aria-label="Закрыть меню"
              className="absolute right-3 top-5 z-10 rounded p-1.5 text-side-ink/70 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur sm:px-6">
          <IconButton label="Открыть меню" className="lg:hidden" onClick={() => setDrawer(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <Logo className="lg:hidden [&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          <div className="flex-1" />
          <IconButton label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={toggle}>
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </IconButton>
          <NotificationBell />
        </header>
        <main className={clsx('paper-grid flex-1', isChat ? 'min-h-0' : 'px-4 py-6 sm:px-8 sm:py-8')}>
          <div className={clsx(isChat ? 'h-full' : 'mx-auto max-w-6xl')}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
