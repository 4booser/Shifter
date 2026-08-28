/**
 * expo-secure-store, for the test runner.
 *
 * The language is read out of the keychain synchronously at module load, which
 * is exactly what makes label tables correct from the first frame — and which
 * also drags React Native's Flow source into a node process that cannot parse
 * it. Nothing under test is about storage, so here it is empty: every test
 * therefore runs in the language the app is written in, which is what the
 * assertions are written in too.
 */
export const getItem = (): string | null => null;
export const setItem = (): void => undefined;
export const getItemAsync = async (): Promise<string | null> => null;
export const setItemAsync = async (): Promise<void> => undefined;
export const deleteItemAsync = async (): Promise<void> => undefined;
