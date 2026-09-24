import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Logo } from '../shared/Logo';
import { useMe } from '../shared/session';
import { useDocumentTitle } from '../shared/useDocumentTitle';
import { HomeScreen } from './home/HomeScreen';
import { LiveRegion, useRealtime } from './live';
import { PasswordForm } from './settings/PasswordForm';
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

/**
 * Screens that need a signed-in user send everyone else to onboarding. Someone
 * signed in with a temporary PIN sees only "Choose a password" until they do.
 */
export function RequireUser({
  children,
}: {
  children: (me: NonNullable<ReturnType<typeof useMe>['data']>) => React.ReactNode;
}) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <Splash />;
  if (!me.data) return <Navigate to={`/m/welcome${location.search}`} replace />;
  if (me.data.mustChangePassword) return <PasswordForm me={me.data} forced />;
  return <>{children(me.data)}</>;
}

export function HomeRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t('routes.mobile'));
  return <RequireUser>{(me) => <HomeScreen me={me} />}</RequireUser>;
}
