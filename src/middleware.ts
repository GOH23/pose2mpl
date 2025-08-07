// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { locales, defaultLocale } from './i18n/config'; // Импортируйте конфигурацию

// Получить предпочтительную локаль из заголовков запроса
function getLocale(request: NextRequest): string {
  // 1. Попробовать получить локаль из cookie (если пользователь выбрал её)
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale as any)) {
    return cookieLocale;
  }

  // 2. Использовать negotiator для определения локали из Accept-Language
  const headers = { 'accept-language': request.headers.get('accept-language') || '' };
  const languages = new Negotiator({ headers }).languages();

  // match автоматически выбирает наиболее подходящую локаль
  return match(languages, [...locales], defaultLocale);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Проверить, начинается ли путь с поддерживаемой локали
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // Если локаль уже есть в пути, ничего не делать
  if (pathnameHasLocale) return;

  // Если локали нет, определить её и перенаправить
  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;

  // Создать ответ с перенаправлением
  const response = NextResponse.redirect(request.nextUrl);

  // (Опционально) Сохранить определённую локаль в cookie
  response.cookies.set('NEXT_LOCALE', locale, { maxAge: 60 * 60 * 24 * 30 }); // 30 дней

  return response;
}

// Настроить matcher для запуска middleware на всех путях, кроме внутренних
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
    '/',
  ],
};