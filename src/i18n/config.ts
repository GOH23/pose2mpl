// lib/i18n/config.ts
export const locales = ['en', 'ru','ja'] as const; // Добавьте нужные вам локали
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en'; // Установите вашу локаль по умолчанию