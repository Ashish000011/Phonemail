import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Me } from '@phonemail/shared';
import { useMe, useSignedIn } from '../../shared/session';
import { BottomSheet, SheetActions } from '../ui/BottomSheet';
import { LanguageStep } from './LanguageStep';
import { PhoneStep } from './PhoneStep';
import { PERMISSION_KEYS, rememberAnswer, useOnboarding } from './store';
import { TermsStep } from './TermsStep';
import { VerifyStep } from './VerifyStep';
import { contactPickerSupported, pickAndShareContacts } from './contacts';

/**
 * Mobile onboarding (docs/spec/07-mobile-ui.md): language → terms → number →
 * code → (contacts) → chats. Permissions are asked one at a time, when they
 * make sense, never all at once.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const reduceMotion = useReducedMotion();
  const step = useOnboarding((s) => s.step);
  const reset = useOnboarding((s) => s.reset);
  const [askContacts, setAskContacts] = useState(false);

  function finish() {
    reset();
    navigate('/m', { replace: true });
  }

  function handleSignedIn(user: Me) {
    signedIn(user);
    if (contactPickerSupported()) setAskContacts(true);
    else finish();
  }

  // Already signed in (e.g. opened /m/welcome again): straight to the chats.
  if (me.data && !askContacts) return <Navigate to="/m" replace />;

  const screen = {
    language: <LanguageStep />,
    terms: <TermsStep />,
    phone: <PhoneStep onSignedIn={handleSignedIn} />,
    verify: <VerifyStep onSignedIn={handleSignedIn} />,
  }[step];

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>

      <BottomSheet open={askContacts} onClose={finish} title={t('onboarding.contactsTitle')}>
        <p className="text-[0.9375rem] text-text-muted">{t('onboarding.contactsBody')}</p>
        <SheetActions
          secondary={t('onboarding.notNow')}
          onSecondary={() => {
            rememberAnswer(PERMISSION_KEYS.contacts, 'no');
            finish();
          }}
          primary={t('onboarding.continue')}
          onPrimary={() => {
            rememberAnswer(PERMISSION_KEYS.contacts, 'yes');
            pickAndShareContacts()
              .catch(() => 0)
              .finally(finish);
          }}
        />
      </BottomSheet>
    </>
  );
}
