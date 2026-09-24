import { Navigate, useLocation } from 'react-router';
import { isMobileDevice } from '../shared/device';

/** "/" sends phones to /m and everything else to /mail, keeping ?phone= and friends. */
export function DeviceRedirect() {
  const { search } = useLocation();
  return <Navigate to={`${isMobileDevice() ? '/m' : '/mail'}${search}`} replace />;
}
