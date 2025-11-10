// lib/i18n/dictionaries/index.ts
import 'server-only';
import type { Locale } from '../config';
// Use a flexible dictionary shape to allow locale-specific keys.
export type Dictionary = Record<string, any>;

const dictionaries: Record<string, () => Promise<Dictionary>> = {
    en: () => import('./en.json').then((module) => module.default as Dictionary),
    ru: () => import('./ru.json').then((module) => module.default as Dictionary),
    ja: () => import('./ja.json').then((module) => module.default as Dictionary)
};

export const getDictionary = async (locale: Locale): Promise<Dictionary> => {
    try {
        const dictModule = await dictionaries[locale]();
        return dictModule;
    } catch (error) {
        console.error(`Failed to load dictionary for locale: ${locale}`, error);
        // Возврат резервного словаря (например, по умолчанию)
        const defaultDictModule = await dictionaries['en'](); // Предполагая, что 'en' всегда существует
        return defaultDictModule;
    }
};