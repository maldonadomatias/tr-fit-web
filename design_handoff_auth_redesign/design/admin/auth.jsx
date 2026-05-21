// Auth pages — login, signup, forgot password, check email, pending approval.

const { useState, useEffect } = React;

function cx2(...parts) { return parts.filter(Boolean).join(" "); }

// ---------- Brand panel (left side) ----------

function BrandPanel({ variant = "login" }) {
  const I = window.Icons;
  const copy = {
    login: {
      eyebrow: "Consola operativa",
      headline: <>Tu cockpit para <em>FORMA</em>.</>,
      sub: "Aprobá altas, revisá suscripciones y mirá el pulso del negocio en un solo lugar.",
    },
    signup: {
      eyebrow: "Sumate al programa",
      headline: <>Entrená con un sistema <em>que entiende</em> cómo progresás.</>,
      sub: "Creá tu cuenta. Nosotros nos encargamos del programa, las cargas y las semanas. Vos venís a entrenar.",
    },
    forgot: {
      eyebrow: "Recuperar acceso",
      headline: <>Sin acceso, <em>sin progreso.</em></>,
      sub: "Te mandamos un link al email para volver al programa.",
    },
  }[variant];

  return (
    <aside className="auth-brand">
      <div className="auth-brand-head">
        <div className="auth-brand-mark">
          <I.Dumbbell size={20} stroke={2.5} />
        </div>
        <div>
          <div className="auth-brand-word">FORMA</div>
          <div className="auth-brand-tag">Strength · ARG</div>
        </div>
      </div>

      <div className="auth-brand-body">
        <div className="auth-brand-eyebrow">{copy.eyebrow}</div>
        <h1 className="auth-brand-headline">{copy.headline}</h1>
        <p className="auth-brand-sub">{copy.sub}</p>

        <div className="auth-brand-foot mt-6">
          <div className="auth-brand-stat">
            <span className="auth-brand-stat-eyebrow">Atletas activos</span>
            <span className="auth-brand-stat-value">312</span>
          </div>
          <div className="auth-brand-stat">
            <span className="auth-brand-stat-eyebrow">Series · 30 d</span>
            <span className="auth-brand-stat-value">48.7K</span>
          </div>
          <div className="auth-brand-stat">
            <span className="auth-brand-stat-eyebrow">PRs · semana</span>
            <span className="auth-brand-stat-value">126</span>
          </div>
        </div>
      </div>

      <div className="auth-brand-quote">
        <span className="mark">“</span>
        Volví a tener objetivos claros por semana. La app me dice qué tocar y cuándo apretar.
        <div style={{ marginTop: 8, color: "white", fontWeight: 600, letterSpacing: "0.02em" }}>
          — Camila P., atleta hace 8 meses
        </div>
      </div>
    </aside>
  );
}

// ---------- Login ----------

function LoginScreen({ navigate }) {
  const I = window.Icons;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError("Completá email y contraseña.");
      return;
    }
    setError(null);
    // demo: simulate the "not approved" state to show the alert
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="auth-eyebrow">Iniciar sesión</div>
      <h2 className="auth-title">Bienvenido de vuelta</h2>
      <p className="auth-sub">Entrá a tu consola para seguir donde lo dejaste.</p>

      {error && (
        <div className="auth-alert">
          <I.AlertTriangle size={16} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="email">Email</label>
        <div className="auth-input-wrap">
          <I.Mail size={16} className="auth-input-icon" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            className="auth-input has-icon"
            placeholder="vos@equipo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="password">
          <span>Contraseña</span>
          <button type="button" className="auth-field-link" onClick={() => navigate("forgot")}>
            ¿La olvidaste?
          </button>
        </label>
        <div className="auth-input-wrap">
          <I.Shield size={16} className="auth-input-icon" />
          <input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="auth-input has-icon"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ paddingRight: 44 }}
          />
          <div className="auth-input-affix">
            <button type="button" onClick={() => setShow(!show)} title={show ? "Ocultar" : "Ver"}>
              {show ? <I.X size={14} /> : <I.Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      <button type="submit" className="auth-cta">
        Iniciar sesión
        <I.ArrowUpRight size={14} />
      </button>

      <div className="auth-footer">
        ¿Todavía no tenés cuenta?{" "}
        <button type="button" className="link" onClick={() => navigate("signup")}>Crear una</button>
      </div>
    </form>
  );
}

// ---------- Signup ----------

function strengthOf(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 3);
}

function SignupScreen({ navigate }) {
  const I = window.Icons;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [role, setRole] = useState("athlete");
  const [agreed, setAgreed] = useState(false);

  const s = strengthOf(password);
  const labels = ["", "débil", "aceptable", "fuerte"];

  function submit(e) {
    e.preventDefault();
    navigate("verify");
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="auth-eyebrow">Crear cuenta</div>
      <h2 className="auth-title">Empezá a entrenar</h2>
      <p className="auth-sub">2 minutos. Sin tarjeta. Vas a recibir un email para verificar.</p>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="name">Nombre completo</label>
        <div className="auth-input-wrap">
          <I.Users size={16} className="auth-input-icon" />
          <input
            id="name"
            type="text"
            autoComplete="name"
            className="auth-input has-icon"
            placeholder="Camila Pereyra"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ fontFamily: "var(--font-sans)" }}
          />
        </div>
      </div>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="su-email">Email</label>
        <div className="auth-input-wrap">
          <I.Mail size={16} className="auth-input-icon" />
          <input
            id="su-email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            className="auth-input has-icon"
            placeholder="vos@equipo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="su-password">
          <span>Contraseña</span>
          <span className="auth-field-link" style={{ fontFamily: "var(--font-mono)" }}>mín. 8</span>
        </label>
        <div className="auth-input-wrap">
          <I.Shield size={16} className="auth-input-icon" />
          <input
            id="su-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            className="auth-input has-icon"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ paddingRight: 44 }}
          />
          <div className="auth-input-affix">
            <button type="button" onClick={() => setShow(!show)} title={show ? "Ocultar" : "Ver"}>
              {show ? <I.X size={14} /> : <I.Eye size={14} />}
            </button>
          </div>
        </div>
        {password && (
          <>
            <div className="pw-meter">
              {[1, 2, 3].map(i => {
                const tone = s >= 3 ? "strong" : s === 2 ? "fair" : "weak";
                return <div key={i} className={cx2("pw-meter-seg", i <= s && `on-${tone}`)} />;
              })}
            </div>
            <div className="pw-meter-text">
              {s === 0 ? "muy corta" : `seguridad: ${labels[s]}`}
            </div>
          </>
        )}
      </div>

      <div className="auth-field">
        <label className="auth-field-label">¿Cómo vas a usar FORMA?</label>
        <div className="auth-role-grid">
          <button
            type="button"
            className={cx2("auth-role", role === "athlete" && "on")}
            onClick={() => setRole("athlete")}
          >
            <span className="auth-role-name"><span className="dot" />Atleta</span>
            <span className="auth-role-desc">Entreno con un programa armado para mí.</span>
          </button>
          <button
            type="button"
            className={cx2("auth-role", role === "coach" && "on")}
            onClick={() => setRole("coach")}
          >
            <span className="auth-role-name"><span className="dot" />Coach</span>
            <span className="auth-role-desc">Acompaño a un equipo de atletas.</span>
          </button>
        </div>
        {role === "coach" && (
          <div className="auth-alert info" style={{ marginTop: 10, marginBottom: 0 }}>
            <I.Info size={16} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Las cuentas de coach requieren aprobación manual. Te avisamos por email en menos de 24 h.</span>
          </div>
        )}
      </div>

      <label className="auth-checkbox" style={{ marginTop: 18 }}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span className="box" />
        <span>
          Acepto los <a href="#">Términos</a> y la <a href="#">Política de privacidad</a> de FORMA.
        </span>
      </label>

      <button type="submit" className="auth-cta" disabled={!agreed}>
        Crear cuenta
        <I.ArrowUpRight size={14} />
      </button>

      <div className="auth-footer">
        ¿Ya tenés cuenta?{" "}
        <button type="button" className="link" onClick={() => navigate("login")}>Iniciar sesión</button>
      </div>
    </form>
  );
}

// ---------- Forgot password ----------

function ForgotScreen({ navigate }) {
  const I = window.Icons;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="auth-confirm">
        <div className="auth-confirm-icon">
          <I.MailCheck size={28} />
        </div>
        <div className="auth-eyebrow">Listo</div>
        <h2 className="auth-title">Mirá tu casilla</h2>
        <p className="auth-sub">Si esa cuenta existe, te mandamos un link para resetear la contraseña.</p>

        <div className="auth-confirm-detail">
          <I.Mail size={14} />
          {email}
        </div>

        <button type="button" className="auth-cta auth-cta-secondary" onClick={() => navigate("login")}>
          <I.ChevronLeft size={14} />
          Volver al login
        </button>

        <div className="auth-footer">
          ¿No te llegó?{" "}
          <button type="button" className="link" onClick={() => setSent(false)}>Intentar de nuevo</button>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={e => { e.preventDefault(); setSent(true); }} noValidate>
      <div className="auth-eyebrow">Recuperar contraseña</div>
      <h2 className="auth-title">Te mandamos un link</h2>
      <p className="auth-sub">Decinos qué email usás y revisá tu casilla.</p>

      <div className="auth-field">
        <label className="auth-field-label" htmlFor="fp-email">Email</label>
        <div className="auth-input-wrap">
          <I.Mail size={16} className="auth-input-icon" />
          <input
            id="fp-email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            className="auth-input has-icon"
            placeholder="vos@equipo.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
      </div>

      <button type="submit" className="auth-cta">
        Enviar link de reseteo
        <I.ArrowUpRight size={14} />
      </button>

      <div className="auth-footer">
        <button type="button" className="link" onClick={() => navigate("login")}>
          <I.ChevronLeft size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
          Volver al login
        </button>
      </div>
    </form>
  );
}

// ---------- Verify email ----------

function VerifyScreen({ navigate }) {
  const I = window.Icons;
  return (
    <div className="auth-confirm">
      <div className="auth-confirm-icon">
        <I.MailCheck size={28} />
      </div>
      <div className="auth-eyebrow">Casi listo</div>
      <h2 className="auth-title">Verificá tu email</h2>
      <p className="auth-sub">Te mandamos un link a tu casilla. Hacé click para activar tu cuenta y empezar.</p>

      <div className="auth-confirm-detail">
        <I.Mail size={14} />
        camila.pereyra@gmail.com
      </div>

      <button type="button" className="auth-cta auth-cta-secondary">
        <I.RefreshCw size={14} />
        Reenviar email
      </button>

      <div className="auth-footer" style={{ marginTop: 18 }}>
        <span style={{ display: "block", marginBottom: 6 }}>¿Email equivocado?</span>
        <button type="button" className="link" onClick={() => navigate("signup")}>Volver a empezar</button>
      </div>
    </div>
  );
}

// ---------- Pending approval ----------

function PendingScreen({ navigate }) {
  const I = window.Icons;
  return (
    <div className="auth-confirm">
      <div className="auth-confirm-icon warn">
        <I.Clock size={28} />
      </div>
      <div className="auth-eyebrow" style={{ color: "hsl(38 92% 45%)" }}>En revisión</div>
      <h2 className="auth-title">Tu cuenta está pendiente</h2>
      <p className="auth-sub">
        Las cuentas de coach las revisamos manualmente antes de habilitar el acceso. Te avisamos por email apenas la aprobemos — en general en menos de 24 h.
      </p>

      <div className="auth-confirm-detail">
        <I.Mail size={14} />
        agus.villa@gmail.com
      </div>

      <button type="button" className="auth-cta auth-cta-secondary" onClick={() => navigate("login")}>
        <I.ChevronLeft size={14} />
        Volver al login
      </button>

      <div className="auth-footer">
        ¿Tenés una urgencia? <a href="mailto:hola@forma.app">Escribinos</a>
      </div>
    </div>
  );
}

// ---------- Auth wrapper ----------

function AuthApp() {
  const I = window.Icons;
  const [tweaks, setTweak] = window.useTweaks(/*EDITMODE-BEGIN*/{ "theme": "light", "screen": "login" }/*EDITMODE-END*/);
  const screen = tweaks.screen;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tweaks.theme === "dark");
  }, [tweaks.theme]);

  function navigate(next) { setTweak("screen", next); }

  const brandVariant = screen === "signup" ? "signup"
    : screen === "forgot" ? "forgot"
    : "login";

  return (
    <div className="auth-stage">
      <BrandPanel variant={brandVariant} />
      <div className="auth-form-wrap">
        <button
          className="auth-theme-toggle"
          onClick={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
          title="Cambiar tema"
        >
          {tweaks.theme === "dark" ? <I.Sun size={14} /> : <I.Moon size={14} />}
        </button>

        {screen === "login"   && <LoginScreen   navigate={navigate} />}
        {screen === "signup"  && <SignupScreen  navigate={navigate} />}
        {screen === "forgot"  && <ForgotScreen  navigate={navigate} />}
        {screen === "verify"  && <VerifyScreen  navigate={navigate} />}
        {screen === "pending" && <PendingScreen navigate={navigate} />}

        <div className="auth-form-wrap-footer">
          <span>FORMA · 2026</span>
          <a href="#">Términos</a>
          <a href="#">Privacidad</a>
          <a href="#">Ayuda</a>
        </div>
      </div>

      {/* Floating screen selector — handy for review */}
      <div className="auth-screen-tabs">
        {[
          { k: "login",   l: "Login" },
          { k: "signup",  l: "Signup" },
          { k: "forgot",  l: "Recuperar" },
          { k: "verify",  l: "Verificar email" },
          { k: "pending", l: "Pendiente" },
        ].map(t => (
          <button key={t.k} className={cx2(screen === t.k && "on")} onClick={() => navigate(t.k)}>
            {t.l}
          </button>
        ))}
      </div>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Apariencia">
          <window.TweakRadio
            label="Tema"
            value={tweaks.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark",  label: "Oscuro" },
            ]}
          />
        </window.TweakSection>
        <window.TweakSection title="Pantalla">
          <window.TweakSelect
            label="Estado"
            value={screen}
            onChange={(v) => navigate(v)}
            options={[
              { value: "login",   label: "Login" },
              { value: "signup",  label: "Signup" },
              { value: "forgot",  label: "Recuperar contraseña" },
              { value: "verify",  label: "Verificar email" },
              { value: "pending", label: "Cuenta pendiente" },
            ]}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AuthApp />);
