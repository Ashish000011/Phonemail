import { z } from 'zod';

/** UI languages PhoneMail ships with. The first one is the default. */
export const LANGUAGES = ['en', 'hi', 'ta'] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;
export const DEFAULT_LANGUAGE: Language = 'en';
