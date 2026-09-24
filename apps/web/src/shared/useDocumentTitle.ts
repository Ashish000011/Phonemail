import { useEffect } from 'react';

/** Sets the browser tab title, e.g. "Create a PhoneMail address · PhoneMail". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title === 'PhoneMail' ? title : `${title} · PhoneMail`;
  }, [title]);
}
