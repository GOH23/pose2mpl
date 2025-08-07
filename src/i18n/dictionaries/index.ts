// lib/i18n/dictionaries/index.ts
import 'server-only';
import type { Locale } from '../config';

const dictionaries = {
    en: () => import('./en.json').then((module) => module.default),
    ru: () => import('./ru.json').then((module) => module.default),
    ja: () => import('./ja.json').then((module) => module.default)
};

export const getDictionary = async (locale: Locale) => {
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