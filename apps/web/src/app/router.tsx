import { createBrowserRouter } from 'react-router';
import { DeviceRedirect } from './DeviceRedirect';
import { NotFound } from './NotFound';
import { Placeholder } from './Placeholder';
import { RegisterPage } from '../portal/RegisterPage';
import { DemoConsole } from '../demo/DemoConsole';

/**
 * Every top-level route. Placeholders are replaced phase by phase:
 * /register (1), /demo (1, 3), /m (4, 5a, 5b), /login and /mail (7).
 */
export const router = createBrowserRouter([
  { path: '/', element: <DeviceRedirect /> },
  { path: '/m/*', element: <Placeholder titleKey="routes.mobile" switchTo="mail" /> },
  { path: '/mail/*', element: <Placeholder titleKey="routes.mail" switchTo="m" /> },
  { path: '/login', element: <Placeholder titleKey="routes.login" /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/demo', element: <DemoConsole /> },
  { path: '/terms', element: <Placeholder titleKey="routes.terms" /> },
  { path: '/privacy', element: <Placeholder titleKey="routes.privacy" /> },
  { path: '*', element: <NotFound /> },
]);
