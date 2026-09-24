import { createBrowserRouter } from 'react-router';
import { DeviceRedirect } from './DeviceRedirect';
import { LegalPage } from './LegalPage';
import { NotFound } from './NotFound';
import { Placeholder } from './Placeholder';
import { RegisterPage } from '../portal/RegisterPage';
import { DemoConsole } from '../demo/DemoConsole';
import { ComingSoon, HomeRoute, MobileShell } from '../mobile/MobileShell';
import { Onboarding } from '../mobile/onboarding/Onboarding';
import { DraftsScreen, FolderScreen } from '../mobile/folders/FolderScreens';
import { ChatScreen } from '../mobile/chat/ChatScreen';

/**
 * Every top-level route. /m is the WhatsApp-style mobile client, /mail the
 * Gmail-style web client (Phase 7), /register the portal, /demo the demo console.
 */
export const router = createBrowserRouter([
  { path: '/', element: <DeviceRedirect /> },
  {
    path: '/m',
    element: <MobileShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'welcome', element: <Onboarding /> },
      { path: 'drafts', element: <DraftsScreen /> },
      { path: 'spam', element: <FolderScreen folder="spam" /> },
      { path: 'trash', element: <FolderScreen folder="trash" /> },
      { path: 'chat/:id', element: <ChatScreen /> },
      { path: 'chat/:id/info', element: <ComingSoon titleKey="routes.chat" /> },
      { path: 'compose', element: <ComingSoon titleKey="routes.compose" /> },
      { path: 'read/:threadId', element: <ComingSoon titleKey="routes.read" /> },
      { path: 'settings', element: <ComingSoon titleKey="routes.settings" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '/mail/*', element: <Placeholder titleKey="routes.mail" switchTo="m" /> },
  { path: '/login', element: <Placeholder titleKey="routes.login" /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/demo', element: <DemoConsole /> },
  { path: '/terms', element: <LegalPage kind="terms" /> },
  { path: '/privacy', element: <LegalPage kind="privacy" /> },
  { path: '*', element: <NotFound /> },
]);
