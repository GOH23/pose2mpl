import ru from './dictionaries/ru.json'
import en from './dictionaries/en.json'
import ja from './dictionaries/ja.json'

const LOCALES: Record<string, Record<string, string>> = {
  en,
  ru,
  ja
}

export type Locale = 'ru' | 'en' | "ja"

const getBrowserLocale = (): Locale => {

  const supportedLocales: Locale[] = ['ru', 'en', 'ja']

  const browserLang = navigator.language || navigator.languages?.[0] || ''

  const primaryLang = browserLang.split('-')[0].toLowerCase()

  if (supportedLocales.includes(primaryLang as Locale)) {
    return primaryLang as Locale
  }

  return 'en'
}

let current: Locale = typeof window !== 'undefined' ? getBrowserLocale() : 'ru'

export function setLocale(l: Locale) {
  current = l
}

export function getLocale() {
  return current
}

export function t(key: string, fallback?: string) {
  const dict = LOCALES[current] || {}
  return dict[key] ?? fallback ?? key
}