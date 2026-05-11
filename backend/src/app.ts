import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorHandler } from './utils/errorHandler.js';
import apiRoutes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (
        process.env.NODE_ENV === 'development' &&
        origin.startsWith('http://localhost:')
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiRoutes);

// Server-side reset-password form (no /api prefix — links sent in emails)
app.get('/reset-password', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  import('./views/reset-password.html.js').then(({ resetPasswordPage }) => {
    res.status(200).type('html').send(resetPasswordPage(token));
  });
});

app.post('/reset-password', express.urlencoded({ extended: false }), async (req, res) => {
  const { resetPasswordPayload } = await import('./domain/schemas.js');
  const { resetPassword, ResetError } = await import('./services/auth.service.js');
  const { resetPasswordPage, resetPasswordSuccessPage } = await import('./views/reset-password.html.js');
  const parsed = resetPasswordPayload.safeParse(req.body);
  if (!parsed.success) {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    return res.status(400).type('html').send(resetPasswordPage(token, 'Password debe tener al menos 8 caracteres'));
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.newPassword);
    return res.status(200).type('html').send(resetPasswordSuccessPage());
  } catch (e) {
    if (e instanceof ResetError) {
      return res.status(400).type('html').send(resetPasswordPage(parsed.data.token, `Token ${e.reason}`));
    }
    throw e;
  }
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
