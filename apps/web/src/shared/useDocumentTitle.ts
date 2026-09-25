import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Create a PhoneMail address · PhoneMail". Null leaves it alone. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    document.title = title === 'PhoneMail' ? title : `${title} · PhoneMail`;
  }, [title]);
}
