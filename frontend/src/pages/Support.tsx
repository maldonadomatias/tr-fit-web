import { LegalLayout } from '@/components/legal/LegalLayout';

const SUPPORT_EMAIL = 'tatoroblesfit@gmail.com';

export default function Support() {
  return (
    <LegalLayout title="Soporte" updated="29 de junio de 2026">
      <p>
        ¿Necesitás ayuda con TR-Fit? Escribinos a{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> desde la
        dirección registrada en tu cuenta y te respondemos dentro de las 48
        horas hábiles.
      </p>

      <h2>Antes de escribirnos</h2>
      <p>Estas son las consultas más frecuentes:</p>

      <h3>No recibí el email de verificación</h3>
      <ul>
        <li>Revisá la carpeta de spam o correo no deseado.</li>
        <li>
          Confirmá que escribiste bien la dirección al registrarte. Si está
          mal, escribinos para corregirla.
        </li>
        <li>
          Desde la pantalla de login podés solicitar el reenvío del email.
        </li>
      </ul>

      <h3>No puedo iniciar sesión</h3>
      <ul>
        <li>
          Probá la opción "Recuperar contraseña" en la pantalla de login.
        </li>
        <li>
          Si tu cuenta dice "Tu acceso está pausado", contactá a tu coach
          para reactivarla.
        </li>
        <li>
          Si la cuenta está pendiente de aprobación, esperá la confirmación de
          tu coach.
        </li>
      </ul>

      <h3>No me llegan las notificaciones push</h3>
      <ul>
        <li>
          Verificá que tengas los permisos de notificaciones habilitados en
          los ajustes del sistema operativo.
        </li>
        <li>
          Desde la app, en Perfil → Notificaciones, asegurate de que los
          avisos que querés recibir estén activados.
        </li>
      </ul>

      <h3>¿Cómo cambio mi rutina?</h3>
      <p>
        Hablá con tu coach. Las rutinas se ajustan de manera personalizada en
        base a tu progreso y feedback.
      </p>

      <h2 id="eliminar-cuenta">Cómo eliminar tu cuenta</h2>
      <p>
        Podés solicitar la eliminación definitiva de tu cuenta y de todos los
        datos asociados siguiendo estos pasos:
      </p>
      <ol className="ml-6 list-decimal space-y-1">
        <li>
          Enviá un email a{' '}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Eliminar%20mi%20cuenta`}>
            {SUPPORT_EMAIL}
          </a>{' '}
          desde la dirección registrada en tu cuenta, con el asunto "Eliminar
          mi cuenta".
        </li>
        <li>
          Confirmaremos tu identidad respondiendo desde el mismo email en un
          plazo máximo de 5 días hábiles.
        </li>
        <li>
          Una vez confirmada la solicitud, eliminaremos tu cuenta, perfil,
          historial de entrenamientos y datos personales en los 30 días
          siguientes.
        </li>
      </ol>
      <p>
        Es posible que conservemos cierta información si una ley nos obliga
        (por ejemplo, registros contables o de facturación). En ese caso te lo
        informaremos al confirmar la baja.
      </p>

      <h2>Reportar un error o sugerencia</h2>
      <p>
        Si encontraste un bug o querés sugerir una mejora, escribinos a{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Reporte%20de%20error`}
        >
          {SUPPORT_EMAIL}
        </a>{' '}
        e incluí:
      </p>
      <ul>
        <li>Qué dispositivo y sistema operativo usás.</li>
        <li>Qué estabas haciendo cuando ocurrió.</li>
        <li>Qué esperabas que pasara y qué pasó en realidad.</li>
        <li>Captura de pantalla si es posible.</li>
      </ul>

      <h2>Información legal</h2>
      <ul>
        <li>
          Política de privacidad: <a href="/privacy">/privacy</a>
        </li>
        <li>
          Términos y condiciones: <a href="/terms">/terms</a>
        </li>
      </ul>
    </LegalLayout>
  );
}
