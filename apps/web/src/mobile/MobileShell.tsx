import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { conversationItemSchema } from '@phonemail/shared';
import { api } from '../shared/api';
import { Logo } from '../shared/Logo';
import { useMe } from '../shared/session';
import { useDocumentTitle } from '../shared/useDocumentTitle';
import { HomeScreen } from './home/HomeScreen';
import { LiveRegion, useRealtime } from './live';
import { IconButton } from './ui/IconButton';
import { TopBar } from './ui/TopBar';
import { ToastHost } from './ui/toast';

/**
 * Everything under /m. Phone-sized: full width on a phone, a centered
 * 480 px column on a laptop (judges often test in a desktop browser).
 */
export function MobileShell() {
  const me = useMe();
  useRealtime(Boolean(me.data));

  // Mobile type scale and theme color for this part of the app.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
    return () =>
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#008069');
  }, []);

  return (
    <div className="min-h-dvh bg-[#e9edef]">
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px] bg-surface sm:shadow-[0_0_24px_rgba(0,0,0,0.08)]">
        <Outlet />
      </div>
      <ToastHost />
      <LiveRegion />
    </div>
  );
}

/** A quiet splash while we find out who's signed in. */
function Splash() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <Logo size={72} />
      <span className="sr-only">{t('placeholder.checking')}</span>
    </div>
  );
}

/** Screens that need a signed-in user send everyone else to onboarding. */
export function RequireUser({
  children,
}: {
  children: (me: NonNullable<ReturnType<typeof useMe>['data']>) => React.ReactNode;
}) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (!me.data) return <Navigate to={`/m/welcome${location.search}`} replace />;
  return <>{children(me.data)}</>;
}

export function HomeRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t('routes.mobile'));
  return <RequireUser>{(me) => <HomeScreen me={me} />}</RequireUser>;
}

/** Placeholder for screens built in the next phases (5a chat, 5b composer, reader, settings). */
export function ComingSoon({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const chat = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api(`/conversations/${id}`, { schema: conversationItemSchema }),
    enabled: titleKey === 'routes.chat' && Boolean(id),
  });
  return (
    <RequireUser>
      {() => (
        <div className="flex min-h-dvh flex-col">
          <TopBar
            title={chat.data ? chat.data.title || t('chat.you') : t(titleKey)}
            subtitle={chat.data?.subtitle}
            left={
              <IconButton label={t('common.back')} icon={ArrowLeft} onClick={() => navigate(-1)} />
            }
          />
          <p className="p-8 text-center text-text-muted">{t('placeholder.comingSoon')}</p>
        </div>
      )}
    </RequireUser>
  );
}
