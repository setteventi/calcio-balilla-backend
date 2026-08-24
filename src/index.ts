import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { supabase } from './db/supabase';
import { authRouter } from './routes/auth';
import { freezeRouter } from './routes/freeze';
import { matchesRouter } from './routes/matches';
import { statsRouter } from './routes/stats';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Sonda che interroga davvero il database, non un semplice ping HTTP.
//
// Serve alla sveglia periodica (.github/workflows/sveglia.yml): Supabase sospende i progetti
// gratuiti dopo 7 giorni senza attività, e il gruppo passa regolarmente più di una settimana
// senza giocare (esiste apposta la funzione freeze per la pausa estiva). Un progetto sospeso
// fa sembrare l'app rotta: le pagine si disegnano ma le liste restano vuote.
//
// È una `head` count: conta le righe senza trasferirle. Tocca Postgres — che è il punto —
// ma non scrive niente e non scarica dati.
app.get('/health/db', async (_req, res) => {
  const { error } = await supabase.from('players').select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[health/db] database irraggiungibile:', error.message);
    res.status(503).json({ db: 'down', errore: error.message });
    return;
  }

  res.json({ db: 'up' });
});

app.use('/auth', authRouter);
app.use('/matches', matchesRouter);
app.use('/stats', statsRouter);
app.use('/freeze', freezeRouter);

app.listen(PORT, () => {
  console.log(`Calcio Balilla backend in ascolto su http://localhost:${PORT}`);
});
