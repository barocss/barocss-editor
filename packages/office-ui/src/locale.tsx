import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createTranslator } from '@barocss/shared';

/** UI language belongs to the application, never to document or storage state. */
const LocaleContext = createContext({ locale: 'ko', setLocale: (_locale: string) => {} });

export function OfficeLocaleProvider({ children, locale, defaultLocale = 'ko', onLocaleChange }: {
  children: ReactNode; locale?: string; defaultLocale?: string; onLocaleChange?: (locale: string) => void;
}) {
  const [localLocale, setLocalLocale] = useState(defaultLocale);
  const value = useMemo(() => ({ locale: locale ?? localLocale, setLocale: (next: string) => {
    if (locale === undefined) setLocalLocale(next);
    onLocaleChange?.(next);
  } }), [locale, localLocale, onLocaleChange]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useOfficeLocale() {
  const context = useContext(LocaleContext);
  const t = useMemo(() => createTranslator(context.locale), [context.locale]);
  return { ...context, t };
}
