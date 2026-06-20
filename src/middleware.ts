export const LITERAL_I18N_PATHNAME_HEADER = 'x-literal-i18n-pathname';

export interface LiteralI18nMiddlewareRequest {
  nextUrl?: {
    pathname?: string;
  };
  url?: string;
  headers: Headers;
}

export interface LiteralI18nMiddlewareNextResponse {
  next(input?: { request?: { headers?: Headers } }): unknown;
}

function getRequestPathname(request: LiteralI18nMiddlewareRequest): string {
  if (request.nextUrl?.pathname) return request.nextUrl.pathname;

  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

export function literalI18nMiddleware(
  request: LiteralI18nMiddlewareRequest,
  nextResponse: LiteralI18nMiddlewareNextResponse,
): unknown {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LITERAL_I18N_PATHNAME_HEADER, getRequestPathname(request));

  return nextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
