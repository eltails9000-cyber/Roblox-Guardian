const BACKEND = 'https://roblox-guardian-3.onrender.com';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const backendUrl = `${BACKEND}${url.pathname}${url.search}`;

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  const response = await fetch(backendUrl, {
    method: context.request.method,
    headers,
    body:
      context.request.method === 'GET' ||
      context.request.method === 'HEAD'
        ? undefined
        : context.request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(response.headers);
  const setCookie = responseHeaders.get('set-cookie');

  if (setCookie) {
    responseHeaders.delete('set-cookie');
    responseHeaders.append(
      'set-cookie',
      setCookie
        .replace(/;\s*Domain=[^;]+/gi, '')
        .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};
