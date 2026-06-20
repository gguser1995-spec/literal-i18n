import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { literalI18nMiddleware } from 'literal-i18n/middleware';

export function proxy(request: NextRequest) {
  return literalI18nMiddleware(request, NextResponse);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
