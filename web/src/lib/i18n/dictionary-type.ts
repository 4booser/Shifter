/**
 * Keys are the English strings as they appear in the templates. A missing key
 * simply falls back to English, so an untranslated addition never breaks.
 *
 * One language per file, loaded on demand.
 *
 * Both dictionaries used to live here and be imported statically, which put
 * 371 kB of translation pairs — 36% of it Cyrillic — into a chunk every page
 * pulled. The public roadmap and status pages, which a stranger opens without
 * an account, each downloaded both languages of the whole application. That
 * is what broke the weight budget and with it the deploy.
 */
export type Dictionary = Record<string, string>;
