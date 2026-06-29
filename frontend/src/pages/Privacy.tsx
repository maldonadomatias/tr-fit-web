import { LegalLayout } from '@/components/legal/LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Política de Privacidad" updated="29 de junio de 2026">
      <p>
        En TR-Fit nos comprometemos a proteger tu información personal. Esta
        Política describe qué datos recopilamos, cómo los usamos, con quién los
        compartimos y los derechos que tenés sobre ellos.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        Santiago Guillermo Robles Avalos ("TR-Fit", "nosotros") es responsable
        del tratamiento de los datos personales recolectados a través de la
        aplicación móvil y el sitio web{' '}
        <a href="https://app.tatoroblesfit.com">app.tatoroblesfit.com</a>.
        Cualquier consulta podés enviarla a{' '}
        <a href="mailto:tatoroblesfit@gmail.com">tatoroblesfit@gmail.com</a>
        .
      </p>

      <h2>2. Datos que recopilamos</h2>
      <h3>2.1 Datos de cuenta</h3>
      <ul>
        <li>Nombre, apellido y dirección de email.</li>
        <li>
          Contraseña (almacenada cifrada mediante hash; nunca en texto plano).
        </li>
        <li>Tokens de sesión y dispositivo desde el que iniciaste sesión.</li>
      </ul>

      <h3>2.2 Datos de salud y entrenamiento</h3>
      <ul>
        <li>
          Datos físicos: peso corporal, altura, edad y sexo.
        </li>
        <li>
          Mediciones corporales que decidas registrar: circunferencias
          (cintura, cadera, pecho, brazo, pierna, cuello), porcentaje de grasa
          corporal estimado, masa muscular, pliegues cutáneos y cualquier
          otra métrica antropométrica que ingreses, junto con la fecha de cada
          medición para construir tu historial.
        </li>
        <li>
          Información de salud autoreportada: lesiones, zonas de dolor o
          molestia, restricciones físicas, objetivos.
        </li>
        <li>
          Historial de entrenamientos: ejercicios realizados, series, repeticiones,
          pesos levantados, tiempos de descanso, percepción de esfuerzo (RIR
          o similar), adherencia y tests de fuerza.
        </li>
        <li>Disponibilidad de equipamiento y preferencias de entrenamiento.</li>
      </ul>

      <h3>2.3 Datos técnicos</h3>
      <ul>
        <li>
          Token de notificaciones push del dispositivo, plataforma (iOS / Android)
          y versión de la aplicación.
        </li>
        <li>
          Registros del servidor: dirección IP, fecha y hora de cada solicitud,
          tipo de navegador o app.
        </li>
      </ul>

      <h2>3. Finalidad del tratamiento</h2>
      <ul>
        <li>Brindarte el servicio de entrenamiento personalizado.</li>
        <li>
          Generar rutinas de entrenamiento adaptadas a tu perfil y objetivos.
        </li>
        <li>Permitir el contacto con tu coach.</li>
        <li>
          Enviar notificaciones operativas (recordatorios de entrenamiento,
          alertas, cambios de estado de cuenta).
        </li>
        <li>
          Validar tu identidad, controlar el acceso y proteger la aplicación de
          usos indebidos.</li>
        <li>Cumplir obligaciones legales y resolver disputas.</li>
      </ul>

      <h2>4. Terceros que procesan tus datos</h2>
      <p>
        Para operar el servicio compartimos datos estrictamente necesarios con
        los siguientes proveedores. Cada uno actúa como encargado de tratamiento
        y está obligado contractualmente a tratar los datos con la finalidad
        indicada:
      </p>
      <ul>
        <li>
          <strong>OpenAI</strong> (Estados Unidos): procesa información de tu
          perfil de entrenamiento (objetivo, equipamiento, lesiones, edad, sexo,
          datos físicos generales) para generar rutinas personalizadas. No se
          envían datos identificatorios directos como nombre o email.
        </li>
        <li>
          <strong>Google Firebase Cloud Messaging</strong>: entrega las
          notificaciones push al dispositivo.
        </li>
        <li>
          <strong>Resend</strong>: envía emails transaccionales (verificación,
          recuperación de contraseña, alertas).
        </li>
        <li>
          <strong>Proveedor de hosting</strong>: aloja la base de datos y los
          servidores donde se procesa la información.
        </li>
      </ul>
      <p>
        Algunos de estos servicios procesan datos fuera de Argentina, en países
        que pueden no contar con un marco de protección equivalente. Al utilizar
        la aplicación prestás tu consentimiento para esta transferencia.
      </p>

      <h2>5. Conservación de los datos</h2>
      <p>
        Conservamos tus datos mientras tu cuenta esté activa. Si solicitás la
        eliminación, los borraremos dentro de los 30 días, salvo que debamos
        retener parte de la información por obligaciones legales, contables o
        para resolver disputas. Los registros técnicos (logs) se conservan por
        hasta 90 días con fines de seguridad y diagnóstico.
      </p>

      <h2>6. Tus derechos</h2>
      <p>Tenés derecho a:</p>
      <ul>
        <li>Acceder a los datos personales que tenemos sobre vos.</li>
        <li>Rectificar datos inexactos o incompletos.</li>
        <li>Solicitar la eliminación de tu cuenta y de tus datos.</li>
        <li>Solicitar una copia portable de tu información.</li>
        <li>Oponerte al tratamiento o limitarlo.</li>
        <li>Retirar tu consentimiento cuando el tratamiento se base en él.</li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos escribinos a{' '}
        <a href="mailto:tatoroblesfit@gmail.com">tatoroblesfit@gmail.com</a>{' '}
        desde la dirección registrada en tu cuenta. Responderemos dentro de los
        10 días hábiles.
      </p>
      <p>
        En Argentina, la autoridad de aplicación es la{' '}
        <strong>
          Agencia de Acceso a la Información Pública (AAIP)
        </strong>{' '}
        (Ley 25.326).
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Implementamos medidas técnicas y organizativas razonables para proteger
        tus datos: cifrado en tránsito (HTTPS / TLS), hash de contraseñas,
        control de accesos, registros de auditoría y separación de entornos. Sin
        embargo, ningún sistema es totalmente inviolable; no podemos garantizar
        seguridad absoluta.
      </p>

      <h2>8. Menores</h2>
      <p>
        El servicio no está destinado a menores de 16 años. No recolectamos
        deliberadamente datos de menores. Si tomamos conocimiento de que un
        menor creó una cuenta, la eliminaremos.
      </p>

      <h2>9. Cookies y tecnologías similares</h2>
      <p>
        El sitio web utiliza almacenamiento local del navegador (localStorage)
        para mantener tu sesión iniciada. La aplicación móvil no utiliza cookies
        publicitarias ni de tracking de terceros.
      </p>

      <h2>10. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta Política. Cuando los cambios sean
        sustanciales te notificaremos por email o dentro de la aplicación con
        al menos 15 días de anticipación. La versión vigente está siempre
        publicada en esta página, junto con la fecha de última actualización.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para consultas sobre privacidad escribinos a{' '}
        <a href="mailto:tatoroblesfit@gmail.com">tatoroblesfit@gmail.com</a>
        .
      </p>
    </LegalLayout>
  );
}
