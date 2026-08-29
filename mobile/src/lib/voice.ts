import { Lang } from '@/lib/i18n';

/**
 * The locale to listen in.
 *
 * Recognition is told which language to expect and gets it badly wrong when
 * told the wrong one — Russian dictated into a Ukrainian recogniser comes back
 * as plausible nonsense rather than as an error, which is the worst way for
 * this to fail.
 *
 * The app's own setting is what somebody chose, and it is what gets used.
 * Nothing clever is attempted with the phone's system language: a Ukrainian
 * phone belonging to somebody who set this app to Russian is a phone whose
 * owner has already answered the question.
 */
export const voiceLocale = (lang: Lang): string => (lang === 'uk' ? 'uk-UA' : 'ru-RU');
