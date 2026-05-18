export function verifySuccessPage(deepLinkScheme: string): string {
  const deepLink = `${deepLinkScheme}://login?verified=1`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Email verificado — TR-FIT</title>
  <style>
    body { font-family: -apple-system, sans-serif; background:#f7f7f7; padding:48px 16px; text-align:center; color:#111 }
    .card { max-width: 400px; margin: 0 auto; background:#fff; padding:32px; border-radius:12px }
    a { display:inline-block; margin-top:20px; padding:12px 24px; background:#000; color:#fff; border-radius:6px; text-decoration:none; font-weight:600 }
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ Email verificado</h1>
    <p>Tu cuenta está activa. Abrí la app para iniciar sesión.</p>
    <a href="${deepLink}">Abrir TR-FIT</a>
  </div>
</body>
</html>`;
}

export function verifyErrorPage(reason: string): string {
  const messages: Record<string, string> = {
    invalid: 'Link inválido.',
    expired: 'Link expirado. Pedí uno nuevo desde la app.',
    used: 'Este link ya fue usado.',
  };
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Error — TR-FIT</title>
  <style>body { font-family: -apple-system, sans-serif; padding:48px 16px; text-align:center; color:#b91c1c }</style>
</head>
<body>
  <h1>${messages[reason] ?? 'Error desconocido.'}</h1>
</body>
</html>`;
}
