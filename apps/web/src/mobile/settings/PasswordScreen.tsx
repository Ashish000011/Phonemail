import { RequireUser } from '../MobileShell';
import { PasswordForm } from './PasswordForm';

export function PasswordScreen() {
  return <RequireUser>{(me) => <PasswordForm me={me} />}</RequireUser>;
}
