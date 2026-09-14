import { Lang } from '@/lib/i18n';

/** The locale to listen in. */
export const voiceLocale = (lang: Lang): string => (lang === 'uk' ? 'uk-UA' : 'ru-RU');
