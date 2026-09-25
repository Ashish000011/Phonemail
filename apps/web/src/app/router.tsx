import { createBrowserRouter, Navigate } from 'react-router';
import { DeviceRedirect } from './DeviceRedirect';
import { LegalPage } from './LegalPage';
import { NotFound } from './NotFound';
import { RegisterPage } from '../portal/RegisterPage';
import { DemoConsole } from '../demo/DemoConsole';
import { HomeRoute, MobileShell } from '../mobile/MobileShell';
import { Onboarding } from '../mobile/onboarding/Onboarding';
import { DraftsScreen, FolderScreen } from '../mobile/folders/FolderScreens';
import { ChatScreen } from '../mobile/chat/ChatScreen';
import { ChatInfoScreen } from '../mobile/chat/ChatInfoScreen';
import { ComposeScreen } from '../mobile/compose/ComposeScreen';
import { ReaderScreen } from '../mobile/read/ReaderScreen';
import { SettingsScreen } from '../mobile/settings/SettingsScreen';
import { ProfileScreen } from '../mobile/settings/ProfileScreen';
import { AliasesScreen } from '../mobile/settings/AliasesScreen';
import { NotificationsScreen } from '../mobile/settings/NotificationsScreen';
import { PrivacyScreen } from '../mobile/settings/PrivacyScreen';
import { DevicesScreen } from '../mobile/settings/DevicesScreen';
import { HelpScreen } from '../mobile/settings/HelpScreen';
import { PasswordScreen } from '../mobile/settings/PasswordScreen';
import { LoginPage } from '../web/LoginPage';
import { MailListRoute, SearchList } from '../web/MailList';
import { ThreadView } from '../web/ThreadView';
import { WebSettings } from '../web/WebSettings';
import { WebShell } from '../web/WebShell';

/**
 * Every top-level route. /m is the WhatsApp-style mobile client, /mail the
 * Gmail-style web client, /login its sign-in, /register the portal, /demo the demo console.
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
      { path: 'chat/:id/info', element: <ChatInfoScreen /> },
      { path: 'compose', element: <ComposeScreen /> },
      { path: 'read/:threadId', element: <ReaderScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: 'settings/profile', element: <ProfileScreen /> },
      { path: 'settings/aliases', element: <AliasesScreen /> },
      { path: 'settings/notifications', element: <NotificationsScreen /> },
      { path: 'settings/privacy', element: <PrivacyScreen /> },
      { path: 'settings/devices', element: <DevicesScreen /> },
      { path: 'settings/help', element: <HelpScreen /> },
      { path: 'settings/password', element: <PasswordScreen /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/mail',
    element: <WebShell />,
    children: [
      { index: true, element: <Navigate to="inbox" replace /> },
      { path: 'search', element: <SearchList /> },
      { path: 'settings', element: <WebSettings /> },
      { path: 'settings/:tab', element: <WebSettings /> },
      { path: ':folder', element: <MailListRoute /> },
      { path: ':folder/:threadId', element: <ThreadView /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/demo', element: <DemoConsole /> },
  { path: '/terms', element: <LegalPage kind="terms" /> },
  { path: '/privacy', element: <LegalPage kind="privacy" /> },
  { path: '*', element: <NotFound /> },
]);
