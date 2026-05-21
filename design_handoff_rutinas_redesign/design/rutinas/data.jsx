// Mock data for the Rutinas review queue.
// All in Spanish (rioplatense, voseo). Numbers are font-mono / tabular.

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------- Atletas ----------
const ATHLETES = {
  ana: {
    id: 'ana',
    name: 'Ana López',
    age: 32, sex: 'F',
    level: 'Intermedio',
    goal: 'Hipertrofia',
    days_per_week: 4,
    days_specific: ['L', 'M', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: ['Lumbar leve · 2024'],
    preferences: ['Sin sentadilla con barra', 'Prefiere mancuernas para empuje'],
  },
  juan: {
    id: 'juan',
    name: 'Juan Pérez',
    age: 41, sex: 'M',
    level: 'Avanzado',
    goal: 'Fuerza',
    days_per_week: 5,
    days_specific: ['L', 'M', 'X', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: ['Ninguna'],
    preferences: ['Foco en básicos', 'Le gusta press militar'],
  },
  pedro: {
    id: 'pedro',
    name: 'Pedro Martínez',
    age: 28, sex: 'M',
    level: 'Intermedio',
    goal: 'Recomposición',
    days_per_week: 3,
    days_specific: ['M', 'J', 'S'],
    equipment: 'Gimnasio completo',
    injuries: ['Hombro derecho · evitar press tras nuca'],
    preferences: ['Quiere terminar < 60min'],
  },
  lucia: {
    id: 'lucia',
    name: 'Lucía R.',
    age: 26, sex: 'F',
    level: 'Principiante',
    goal: 'Tonificación',
    days_per_week: 3,
    days_specific: ['L', 'X', 'V'],
    equipment: 'Mancuernas + bandas',
    injuries: ['Rodilla izquierda · 2023'],
    preferences: ['Sin saltos', 'Prefiere full body'],
  },
  matias: {
    id: 'matias',
    name: 'Matías Castro',
    age: 35, sex: 'M',
    level: 'Intermedio',
    goal: 'Hipertrofia',
    days_per_week: 4,
    days_specific: ['L', 'M', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: ['Ninguna'],
    preferences: [],
  },
  sofia: {
    id: 'sofia',
    name: 'Sofía Gómez',
    age: 29, sex: 'F',
    level: 'Avanzado',
    goal: 'Fuerza',
    days_per_week: 4,
    days_specific: ['L', 'M', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: ['Codo derecho · 2025'],
    preferences: [],
  },
  diego: {
    id: 'diego',
    name: 'Diego Salas',
    age: 38, sex: 'M',
    level: 'Intermedio',
    goal: 'Hipertrofia',
    days_per_week: 5,
    days_specific: ['L', 'M', 'X', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: [],
    preferences: ['Sin máquina sentadilla hack'],
  },
  paula: {
    id: 'paula',
    name: 'Paula Romero',
    age: 31, sex: 'F',
    level: 'Intermedio',
    goal: 'Hipertrofia',
    days_per_week: 3,
    days_specific: ['L', 'X', 'V'],
    equipment: 'Gimnasio completo',
    injuries: [],
    preferences: [],
  },
  bruno: {
    id: 'bruno',
    name: 'Bruno Acosta',
    age: 44, sex: 'M',
    level: 'Principiante',
    goal: 'Recomposición',
    days_per_week: 3,
    days_specific: ['M', 'J', 'S'],
    equipment: 'Gimnasio completo',
    injuries: ['Hipertensión controlada'],
    preferences: ['Quiere familiarizarse con máquinas'],
  },
  vale: {
    id: 'vale',
    name: 'Valentina Díaz',
    age: 27, sex: 'F',
    level: 'Intermedio',
    goal: 'Fuerza',
    days_per_week: 4,
    days_specific: ['L', 'M', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: [],
    preferences: ['Foco en peso muerto'],
  },
  nico: {
    id: 'nico',
    name: 'Nicolás Vega',
    age: 33, sex: 'M',
    level: 'Avanzado',
    goal: 'Hipertrofia',
    days_per_week: 5,
    days_specific: ['L', 'M', 'X', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: [],
    preferences: [],
  },
  flor: {
    id: 'flor',
    name: 'Florencia Méndez',
    age: 30, sex: 'F',
    level: 'Intermedio',
    goal: 'Hipertrofia',
    days_per_week: 4,
    days_specific: ['L', 'M', 'J', 'V'],
    equipment: 'Gimnasio completo',
    injuries: ['Cervical · cuidado con remo alto'],
    preferences: [],
  },
};

// ---------- Helpers ----------
function ago(ts) {
  const diff = NOW - ts;
  if (diff < HOUR) return Math.round(diff / (60 * 1000)) + 'min';
  if (diff < DAY) return Math.round(diff / HOUR) + 'h';
  return Math.round(diff / DAY) + 'd';
}

function confidenceBucket(c) {
  if (c >= 85) return 'high';
  if (c >= 70) return 'med';
  return 'low';
}

// ---------- Routine for Ana (the "active" one) ----------
const ANA_ROUTINE = [
  {
    day: 1, focus: 'Empuje',
    slots: [
      { id: 's1', name: 'Press banca', sets: 4, reps: '6-8', rir: 2 },
      { id: 's2', name: 'Press inclinado con mancuernas', sets: 3, reps: '8-10', rir: 2, modified: true },
      { id: 's3', name: 'Press militar con barra', sets: 3, reps: '6-8', rir: 2 },
      { id: 's4', name: 'Aperturas en polea', sets: 3, reps: '10-12', rir: 1 },
      { id: 's5', name: 'Extensiones tríceps con cuerda', sets: 3, reps: '10-12', rir: 1 },
    ],
  },
  {
    day: 2, focus: 'Tracción',
    slots: [
      { id: 's6', name: 'Peso muerto convencional', sets: 4, reps: '5', rir: 2 },
      { id: 's7', name: 'Dominadas con asistencia', sets: 3, reps: '6-8', rir: 2 },
      { id: 's8', name: 'Remo con barra', sets: 4, reps: '8-10', rir: 2, modified: true },
      { id: 's9', name: 'Curl con barra Z', sets: 3, reps: '8-10', rir: 1 },
      { id: 's10', name: 'Face pull', sets: 3, reps: '12-15', rir: 1 },
    ],
  },
  {
    day: 3, focus: 'Pierna',
    slots: [
      { id: 's11', name: 'Hip thrust con barra', sets: 4, reps: '6-8', rir: 2, modified: true },
      { id: 's12', name: 'Prensa 45°', sets: 4, reps: '8-10', rir: 2 },
      { id: 's13', name: 'Curl femoral acostado', sets: 3, reps: '10-12', rir: 1 },
      { id: 's14', name: 'Extensión cuádriceps', sets: 3, reps: '10-12', rir: 1 },
      { id: 's15', name: 'Elevación de gemelos de pie', sets: 4, reps: '12-15', rir: 1 },
    ],
  },
  {
    day: 4, focus: 'Full body accesorio',
    slots: [
      { id: 's16', name: 'Press banca con mancuernas', sets: 3, reps: '8-10', rir: 2 },
      { id: 's17', name: 'Remo con mancuerna unilateral', sets: 3, reps: '10-12', rir: 1 },
      { id: 's18', name: 'Sentadilla goblet', sets: 3, reps: '10-12', rir: 1 },
      { id: 's19', name: 'Plancha frontal', sets: 3, reps: '40s', rir: 1 },
    ],
  },
];

// ---------- Diff vs previous routine for Ana ----------
const ANA_DIFF = [
  {
    day: 1, focus: 'Empuje', changes: [
      { kind: 'modified', name: 'Press inclinado con mancuernas', before: '4 × 8-10 · RIR 2', after: '3 × 8-10 · RIR 2', reason: 'Bajé serie por fatiga acumulada' },
      { kind: 'removed', name: 'Fondos en paralelas', spec: '3 × 8 · RIR 2' },
    ],
  },
  {
    day: 2, focus: 'Tracción', changes: [
      { kind: 'added', name: 'Face pull', spec: '3 × 12-15 · RIR 1' },
      { kind: 'modified', name: 'Remo con barra', before: '3 × 8-10 · RIR 2', after: '4 × 8-10 · RIR 2', reason: 'Subí volumen por respuesta positiva' },
    ],
  },
  {
    day: 3, focus: 'Pierna', changes: [
      { kind: 'modified', name: 'Hip thrust con barra', before: '3 × 8 · RIR 2', after: '4 × 6-8 · RIR 2', reason: 'Subí intensidad y volumen' },
    ],
  },
];

// ---------- History for Ana ----------
const ANA_PREV_ROUTINES = [
  { id: 'r0', date: '2026-04-22', label: 'Bloque 10 · Hipertrofia', duration: '5 sem', },
  { id: 'r-1', date: '2026-03-11', label: 'Bloque 9 · Hipertrofia', duration: '5 sem' },
  { id: 'r-2', date: '2026-02-04', label: 'Bloque 8 · Acumulación', duration: '4 sem' },
];

const ANA_SESSIONS = [
  { date: '2026-05-19', exercise: 'Press banca · 4×6', rpe: 8.2, rir: 1.8, top: '62.5 kg' },
  { date: '2026-05-17', exercise: 'Peso muerto · 4×5', rpe: 8.8, rir: 1.2, top: '95.0 kg' },
  { date: '2026-05-15', exercise: 'Hip thrust · 3×8', rpe: 7.7, rir: 2.3, top: '85.0 kg' },
  { date: '2026-05-14', exercise: 'Remo con barra · 3×8', rpe: 8.1, rir: 1.9, top: '52.5 kg' },
  { date: '2026-05-12', exercise: 'Press banca · 4×6', rpe: 8.5, rir: 1.5, top: '60.0 kg' },
  { date: '2026-05-10', exercise: 'Peso muerto · 4×5', rpe: 9.0, rir: 1.0, top: '92.5 kg' },
  { date: '2026-05-08', exercise: 'Press inclinado · 4×8', rpe: 7.9, rir: 2.1, top: '24.0 kg' },
  { date: '2026-05-07', exercise: 'Dominadas con asist. · 3×8', rpe: 8.3, rir: 1.7, top: '-12 kg' },
  { date: '2026-05-05', exercise: 'Hip thrust · 3×8', rpe: 7.5, rir: 2.5, top: '82.5 kg' },
  { date: '2026-05-03', exercise: 'Press banca · 4×6', rpe: 8.4, rir: 1.6, top: '60.0 kg' },
];

// ---------- Pending queue ----------
const QUEUE = [
  {
    id: 'rt-001',
    athleteId: 'ana',
    confidence: 87,
    createdAt: NOW - 40 * HOUR,
    state: 'pending',
    retries: 0,
    rationale: 'Ajusté volumen de empuje porque RPE de las últimas 3 sesiones quedó en 9. Bajé series en press banca y subí volumen en pectoral inferior con press inclinado. Mantengo peso muerto convencional porque progresa bien (+2.5 kg vs bloque anterior).',
    routine: ANA_ROUTINE,
    diff: ANA_DIFF,
    prevRoutines: ANA_PREV_ROUTINES,
    sessions: ANA_SESSIONS,
    modifiedCount: 3,
  },
  { id: 'rt-002', athleteId: 'juan',  confidence: 72, createdAt: NOW - 5 * HOUR,  state: 'pending', retries: 0 },
  { id: 'rt-003', athleteId: 'pedro', confidence: 91, createdAt: NOW - 8 * HOUR,  state: 'pending', retries: 0 },
  { id: 'rt-004', athleteId: 'lucia', confidence: 68, createdAt: NOW - 12 * HOUR, state: 'retry',   retries: 2 },
  { id: 'rt-005', athleteId: 'matias',confidence: 84, createdAt: NOW - 14 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-006', athleteId: 'sofia', confidence: 89, createdAt: NOW - 18 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-007', athleteId: 'diego', confidence: 76, createdAt: NOW - 22 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-008', athleteId: 'paula', confidence: 81, createdAt: NOW - 26 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-009', athleteId: 'bruno', confidence: 64, createdAt: NOW - 30 * HOUR, state: 'retry',   retries: 1 },
  { id: 'rt-010', athleteId: 'vale',  confidence: 88, createdAt: NOW - 32 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-011', athleteId: 'nico',  confidence: 93, createdAt: NOW - 36 * HOUR, state: 'pending', retries: 0 },
  { id: 'rt-012', athleteId: 'flor',  confidence: 79, createdAt: NOW - 38 * HOUR, state: 'pending', retries: 0 },
];

// ---------- Exercise catalog (used by edit popover) ----------
const EXERCISES = [
  { name: 'Press banca', tag: 'Pecho · Barra' },
  { name: 'Press banca con mancuernas', tag: 'Pecho · Mancuernas' },
  { name: 'Press inclinado con barra', tag: 'Pecho · Barra' },
  { name: 'Press inclinado con mancuernas', tag: 'Pecho · Mancuernas' },
  { name: 'Press declinado', tag: 'Pecho · Barra' },
  { name: 'Aperturas en polea', tag: 'Pecho · Polea' },
  { name: 'Fondos en paralelas', tag: 'Pecho · Peso corporal' },
  { name: 'Press militar con barra', tag: 'Hombro · Barra' },
  { name: 'Press militar con mancuernas', tag: 'Hombro · Mancuernas' },
  { name: 'Elevaciones laterales', tag: 'Hombro · Mancuernas' },
  { name: 'Face pull', tag: 'Hombro · Polea' },
  { name: 'Remo con barra', tag: 'Espalda · Barra' },
  { name: 'Remo con mancuerna unilateral', tag: 'Espalda · Mancuernas' },
  { name: 'Dominadas', tag: 'Espalda · Peso corporal' },
  { name: 'Dominadas con asistencia', tag: 'Espalda · Máquina' },
  { name: 'Jalón al pecho', tag: 'Espalda · Polea' },
  { name: 'Peso muerto convencional', tag: 'Pierna · Barra' },
  { name: 'Peso muerto rumano', tag: 'Pierna · Barra' },
  { name: 'Sentadilla con barra', tag: 'Pierna · Barra' },
  { name: 'Sentadilla goblet', tag: 'Pierna · Mancuernas' },
  { name: 'Hip thrust con barra', tag: 'Pierna · Barra' },
  { name: 'Prensa 45°', tag: 'Pierna · Máquina' },
  { name: 'Curl femoral acostado', tag: 'Pierna · Máquina' },
  { name: 'Extensión cuádriceps', tag: 'Pierna · Máquina' },
  { name: 'Elevación de gemelos de pie', tag: 'Pierna · Máquina' },
  { name: 'Curl con barra Z', tag: 'Bíceps · Barra' },
  { name: 'Curl alterno con mancuernas', tag: 'Bíceps · Mancuernas' },
  { name: 'Extensiones tríceps con cuerda', tag: 'Tríceps · Polea' },
  { name: 'Press francés', tag: 'Tríceps · Barra' },
  { name: 'Plancha frontal', tag: 'Core · Peso corporal' },
];

// ---------- Reject reasons (tag-based) ----------
const REJECT_REASONS = [
  { label: 'Volumen', tags: ['Mucho', 'Poco'] },
  { label: 'Intensidad', tags: ['Muy alta', 'Muy baja'] },
  { label: 'Selección', tags: ['Ejercicios no aptos', 'Falta variedad'] },
  { label: 'Equipo', tags: ['No disponible', 'Mal asignado'] },
  { label: 'Lesión', tags: ['Ignora lesión', 'Riesgo articular'] },
  { label: 'Estructura', tags: ['Mal split', 'Días desbalanceados'] },
];

// ---------- Last approved (for "Todo al día") ----------
const LAST_APPROVED = {
  athleteName: 'Pedro M.',
  agoLabel: 'hace 23min',
};

window.RutinaData = {
  ATHLETES,
  QUEUE,
  EXERCISES,
  REJECT_REASONS,
  LAST_APPROVED,
  ago,
  confidenceBucket,
};
