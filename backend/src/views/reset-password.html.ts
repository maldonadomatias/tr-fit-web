export function resetPasswordPage(token: string, error?: string): string {
  const errBlock = error
    ? `<p style="color:#b91c1c;margin:0 0 16px 0">${error}</p>`
    : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Restablecer contraseña — TR-FIT</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f7f7f7; margin:0; padding:48px 16px; color:#111 }
    .card { max-width: 400px; margin: 0 auto; background:#fff; padding:32px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.04) }
    h1 { font-size:20px; margin:0 0 16px 0 }
    label { display:block; font-size:13px; color:#555; margin:12px 0 4px }
    input[type=password] { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #ddd; border-radius:6px; font-size:15px }
    button { width:100%; padding:12px; background:#000; color:#fff; border:0; border-radius:6px; font-size:15px; font-weight:600; margin-top:20px; cursor:pointer }
  </style>
</head>
<body>
  <div class="card">
    <h1>Restablecer contraseña</h1>
    ${errBlock}
    <form method="post" action="/reset-password">
      <input type="hidden" name="token" value="${token}">
      <label>Contraseña nueva</label>
      <input type="password" name="newPassword" required minlength="8" autocomplete="new-password">
      <button type="submit">Guardar</button>
    </form>
  </div>
</body>
</html>`;
}

export function resetPasswordSuccessPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Contraseña actualizada — TR-FIT</title>
  <style>
    body { font-family: -apple-system, sans-serif; background:#f7f7f7; padding:48px 16px; text-align:center }
    .card { max-width: 400px; margin: 0 auto; background:#fff; padding:32px; border-radius:12px }
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ Contraseña actualizada</h1>
    <p>Volvé a la app TR-FIT para iniciar sesión con tu nueva contraseña.</p>
  </div>
</body>
</html>`;
}

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
