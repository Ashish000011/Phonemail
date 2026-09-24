import { useNavigate } from 'react-router';

/**
 * Back to the previous screen, or to a sensible parent when the page was
 * opened directly (a link, a reload) and there is nothing to go back to.
 */
export function useGoBack(fallback = '/m') {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
