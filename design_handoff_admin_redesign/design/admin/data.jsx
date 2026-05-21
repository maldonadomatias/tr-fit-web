// Mock data — same shape as backend AdminUser / CoachAlert / etc.
// Spanish, voseo, FORMA tone.

const NAMES = [
  "Matías Robles", "Camila Pereyra", "Tomás Aguilar", "Sofía Domínguez",
  "Joaquín Vázquez", "Lucía Méndez", "Ignacio Bertotti", "Valentina Ruiz",
  "Federico Sosa", "Martina Quiroga", "Bruno Cattáneo", "Renata Espósito",
  "Agustín Villa", "Florencia Bianchi", "Lautaro Almada", "Delfina Cabrera",
  "Nicolás Pérez", "Antonella Romero", "Gonzalo Iturria", "Catalina Funes",
  "Diego Aramburu", "Paula Lascano", "Emiliano Roldán", "Micaela Gauto",
  "Santiago Vidal", "Sol Maidana", "Ramiro Casiraghi", "Julieta Herrera",
  "Bautista Olivera", "Rocío Maldonado",
];

const EMAILS = [
  "tato@forma.app", "cami.p@gmail.com", "tomas.aguilar@hotmail.com", "sofidominguez@gmail.com",
  "jvazquez@outlook.com", "luc.mendez@gmail.com", "ibertotti@gmail.com", "valeruiz@gmail.com",
  "fede.sosa@gmail.com", "martinaq@gmail.com", "bruno.c@yahoo.com", "renata.esposito@gmail.com",
  "agusvilla@gmail.com", "florbianchi@gmail.com", "lalmada@gmail.com", "dcabrera@gmail.com",
  "nico.perez@gmail.com", "anto.romero@gmail.com", "gonza.iturria@gmail.com", "cata.funes@gmail.com",
  "daramburu@gmail.com", "plascano@hotmail.com", "emiroldan@gmail.com", "mica.gauto@gmail.com",
  "santi.vidal@gmail.com", "sol.maidana@gmail.com", "ramiro.c@gmail.com", "juli.herrera@gmail.com",
  "bauti.o@gmail.com", "ro.maldonado@gmail.com",
];

const TIERS = ["basico", "full", "premium"];
const STATUSES = ["pending", "approved", "rejected"];
const SUB_STATUSES = ["pending", "authorized", "paused", "cancelled"];
const ROLES = ["athlete", "coach", "admin"];

function daysAgo(d) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
}

const USERS = NAMES.map((name, i) => {
  // Distribute statuses & roles realistically
  const status = i < 4 ? "pending" : i === 9 ? "rejected" : "approved";
  const role = i === 0 ? "admin" : i === 5 || i === 14 ? "coach" : "athlete";
  // Subscription distribution
  let tier = null;
  let subStatus = null;
  let periodEnd = null;
  if (status === "approved" && role === "athlete") {
    const r = (i * 7) % 10;
    if (r < 5) { tier = "full"; subStatus = "authorized"; }
    else if (r < 7) { tier = "premium"; subStatus = "authorized"; }
    else if (r < 8) { tier = "basico"; subStatus = "authorized"; }
    else if (r === 8) { tier = "full"; subStatus = "paused"; }
    else { tier = "full"; subStatus = "cancelled"; }
    if (subStatus !== "cancelled") {
      const d = new Date();
      d.setDate(d.getDate() + ((i * 3) % 28));
      periodEnd = d.toISOString();
    }
  } else if (status === "approved" && role === "coach") {
    tier = "premium"; subStatus = "authorized";
    const d = new Date(); d.setDate(d.getDate() + 21); periodEnd = d.toISOString();
  }
  return {
    id: `usr_${(i + 1).toString().padStart(4, "0")}`,
    email: EMAILS[i],
    name,
    role,
    status,
    email_verified: !(i === 1 || i === 3 || i === 16),
    email_verified_at: !(i === 1 || i === 3 || i === 16) ? daysAgo((i + 1) * 2) : null,
    created_at: daysAgo(60 - i * 2),
    subscription_tier: tier,
    subscription_status: subStatus,
    current_period_end: periodEnd,
    last_session_at: status === "approved" && role === "athlete"
      ? daysAgo((i * 2) % 14) : null,
    sessions_30d: status === "approved" && role === "athlete"
      ? ((i * 13) % 22) : 0,
    initials: name.split(" ").map(p => p[0]).slice(0, 2).join(""),
  };
});

// KPIs
const KPI = {
  signupsMonth: 47,
  signupsDelta: +12,
  signupsTrend: [4, 6, 3, 5, 8, 7, 9, 11, 8, 12, 9, 14, 13, 16, 15, 19, 17, 21, 23, 20, 24, 27, 29, 33, 31, 36, 38, 41, 44, 47],
  pendingCount: USERS.filter(u => u.status === "pending").length,
  activeSubs: USERS.filter(u => u.subscription_status === "authorized").length,
  activeSubsDelta: +3,
  mrr: 318420, // ARS
  mrrDelta: +7.4,
  mrrTrend: [180, 192, 201, 215, 224, 240, 255, 263, 271, 284, 295, 318],
  churnPct: 2.1,
  churnDelta: -0.3,
  verifiedPct: 91,
  rejected30d: 2,
};

// Activity log
const ACTIVITY = [
  { id: "ev01", type: "user_approved", actor: "tato@forma.app", target: "luc.mendez@gmail.com", time: 4, severity: "brand" },
  { id: "ev02", type: "subscription_authorized", actor: "MercadoPago", target: "fede.sosa@gmail.com", meta: "full · $4 500/mes", time: 18 },
  { id: "ev03", type: "user_created", actor: "auto-signup", target: "anto.romero@gmail.com", time: 36 },
  { id: "ev04", type: "user_rejected", actor: "tato@forma.app", target: "valeruiz@gmail.com", time: 72, severity: "destructive" },
  { id: "ev05", type: "subscription_cancelled", actor: "user", target: "santi.vidal@gmail.com", meta: "full · cobró 3 meses", time: 96, severity: "warning" },
  { id: "ev06", type: "email_verified", actor: "system", target: "cata.funes@gmail.com", time: 142 },
  { id: "ev07", type: "role_changed", actor: "tato@forma.app", target: "agusvilla@gmail.com", meta: "athlete → coach", time: 180, severity: "brand" },
  { id: "ev08", type: "subscription_authorized", actor: "MercadoPago", target: "martinaq@gmail.com", meta: "premium · $7 800/mes", time: 220 },
  { id: "ev09", type: "user_approved", actor: "tato@forma.app", target: "ibertotti@gmail.com", time: 280, severity: "brand" },
  { id: "ev10", type: "password_reset", actor: "user", target: "bruno.c@yahoo.com", time: 340 },
  { id: "ev11", type: "user_created", actor: "auto-signup", target: "ramiro.c@gmail.com", time: 410 },
  { id: "ev12", type: "subscription_paused", actor: "user", target: "florbianchi@gmail.com", meta: "full · pausa 14 días", time: 480, severity: "warning" },
];

const ACTIVITY_LABELS = {
  user_approved: "Usuario aprobado",
  user_rejected: "Usuario rechazado",
  user_created: "Cuenta creada",
  subscription_authorized: "Suscripción activada",
  subscription_cancelled: "Suscripción cancelada",
  subscription_paused: "Suscripción pausada",
  email_verified: "Email verificado",
  role_changed: "Rol modificado",
  password_reset: "Contraseña restablecida",
};

function fmtMinutes(min) {
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min/60)} h`;
  return `hace ${Math.floor(min/1440)} d`;
}

function fmtARS(n) {
  return "$" + n.toLocaleString("es-AR");
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

Object.assign(window, {
  USERS, KPI, ACTIVITY, ACTIVITY_LABELS,
  TIERS, STATUSES, SUB_STATUSES, ROLES,
  fmtMinutes, fmtARS, fmtDate, fmtDateShort,
});
