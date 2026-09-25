import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { DeviceRedirect } from './DeviceRedirect';
import { NotFound } from './NotFound';
import { Logo } from '../shared/Logo';

/** Shown while the first screen's code downloads. */
function AppSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <Logo size={64} />
    </div>
  );
}

/**
 * Each screen loads its code when first opened, so a phone opening /m doesn't
 * download the Gmail client, the demo console or the country list it doesn't
 * need. Shared pieces (React, the API client, translations) stay in the main file.
 */
const mobile = {
  shell: () => import('../mobile/MobileShell'),
  onboarding: () => import('../mobile/onboarding/Onboarding'),
  folders: () => import('../mobile/folders/FolderScreens'),
  chat: () => import('../mobile/chat/ChatScreen'),
  chatInfo: () => import('../mobile/chat/ChatInfoScreen'),
  compose: () => import('../mobile/compose/ComposeScreen'),
  read: () => import('../mobile/read/ReaderScreen'),
  settings: () => import('../mobile/settings/SettingsScreen'),
  profile: () => import('../mobile/settings/ProfileScreen'),
  aliases: () => import('../mobile/settings/AliasesScreen'),
  notifications: () => import('../mobile/settings/NotificationsScreen'),
  privacy: () => import('../mobile/settings/PrivacyScreen'),
  devices: () => import('../mobile/settings/DevicesScreen'),
  help: () => import('../mobile/settings/HelpScreen'),
  password: () => import('../mobile/settings/PasswordScreen'),
};
const web = {
  shell: () => import('../web/WebShell'),
  list: () => import('../web/MailList'),
  thread: () => import('../web/ThreadView'),
  settings: () => import('../web/WebSettings'),
  login: () => import('../web/LoginPage'),
};

const routes: RouteObject[] = [
  { path: '/', element: <DeviceRedirect /> },
  {
    path: '/m',
    lazy: async () => ({ Component: (await mobile.shell()).MobileShell }),
    children: [
      { index: true, lazy: async () => ({ Component: (await mobile.shell()).HomeRoute }) },
      {
        path: 'welcome',
        lazy: async () => ({ Component: (await mobile.onboarding()).Onboarding }),
      },
      { path: 'drafts', lazy: async () => ({ Component: (await mobile.folders()).DraftsScreen }) },
      {
        path: 'spam',
        lazy: async () => {
          const { FolderScreen } = await mobile.folders();
          return { element: <FolderScreen folder="spam" /> };
        },
      },
      {
        path: 'trash',
        lazy: async () => {
          const { FolderScreen } = await mobile.folders();
          return { element: <FolderScreen folder="trash" /> };
        },
      },
      { path: 'chat/:id', lazy: async () => ({ Component: (await mobile.chat()).ChatScreen }) },
      {
        path: 'chat/:id/info',
        lazy: async () => ({ Component: (await mobile.chatInfo()).ChatInfoScreen }),
      },
      {
        path: 'compose',
        lazy: async () => ({ Component: (await mobile.compose()).ComposeScreen }),
      },
      {
        path: 'read/:threadId',
        lazy: async () => ({ Component: (await mobile.read()).ReaderScreen }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await mobile.settings()).SettingsScreen }),
      },
      {
        path: 'settings/profile',
        lazy: async () => ({ Component: (await mobile.profile()).ProfileScreen }),
      },
      {
        path: 'settings/aliases',
        lazy: async () => ({ Component: (await mobile.aliases()).AliasesScreen }),
      },
      {
        path: 'settings/notifications',
        lazy: async () => ({ Component: (await mobile.notifications()).NotificationsScreen }),
      },
      {
        path: 'settings/privacy',
        lazy: async () => ({ Component: (await mobile.privacy()).PrivacyScreen }),
      },
      {
        path: 'settings/devices',
        lazy: async () => ({ Component: (await mobile.devices()).DevicesScreen }),
      },
      {
        path: 'settings/help',
        lazy: async () => ({ Component: (await mobile.help()).HelpScreen }),
      },
      {
        path: 'settings/password',
        lazy: async () => ({ Component: (await mobile.password()).PasswordScreen }),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/mail',
    lazy: async () => ({ Component: (await web.shell()).WebShell }),
    children: [
      { index: true, element: <Navigate to="inbox" replace /> },
      { path: 'search', lazy: async () => ({ Component: (await web.list()).SearchList }) },
      { path: 'settings', lazy: async () => ({ Component: (await web.settings()).WebSettings }) },
      {
        path: 'settings/:tab',
        lazy: async () => ({ Component: (await web.settings()).WebSettings }),
      },
      { path: ':folder', lazy: async () => ({ Component: (await web.list()).MailListRoute }) },
      {
        path: ':folder/:threadId',
        lazy: async () => ({ Component: (await web.thread()).ThreadView }),
      },
    ],
  },
  { path: '/login', lazy: async () => ({ Component: (await web.login()).LoginPage }) },
  {
    path: '/register',
    lazy: async () => ({ Component: (await import('../portal/RegisterPage')).RegisterPage }),
  },
  {
    path: '/demo',
    lazy: async () => ({ Component: (await import('../demo/DemoConsole')).DemoConsole }),
  },
  {
    path: '/terms',
    lazy: async () => {
      const { LegalPage } = await import('./LegalPage');
      return { element: <LegalPage kind="terms" /> };
    },
  },
  {
    path: '/privacy',
    lazy: async () => {
      const { LegalPage } = await import('./LegalPage');
      return { element: <LegalPage kind="privacy" /> };
    },
  },
  { path: '*', element: <NotFound /> },
];

/**
 * Every top-level route. /m is the WhatsApp-style mobile client, /mail the
 * Gmail-style web client, /login its sign-in, /register the portal, /demo
 * the demo console.
 */
export const router = createBrowserRouter([{ HydrateFallback: AppSplash, children: routes }]);
