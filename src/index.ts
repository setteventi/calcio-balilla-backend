import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { pingDb, requireDb, segnalaDbSu } from './middleware/dbHealth';
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

// Health check di Render: NON tocca il database, deve restare istantaneo.
app.get('/health', (_req, res) => res.json({ ok: true }));

// Ping vero del database, senza cache. Ha due utenti:
//  · la sveglia periodica (.github/workflows/sveglia.yml), che così azzera il contatore di
//    inattività di Supabase — sospende i progetti gratuiti dopo 7 giorni, e questo gruppo
//    smette di giocare per settimane (esiste apposta la funzione freeze per l'estate);
//  · la schermata di attesa del frontend, per sapere quando può ricaricare da sola.
// Legge una riga sola e non scrive niente. Deve restare fuori da requireDb: è proprio la
// chiamata che serve quando il database è giù.
app.get('/health/db', async (_req, res) => {
  const su = await pingDb();
  if (su) segnalaDbSu();
  res.status(su ? 200 : 503).json(su ? { db: 'up' } : { db: 'down', code: 'DB_DOWN' });
});

// Da qui in giù serve il database: se è sospeso si risponde 503 in un attimo, invece di far
// aspettare a ogni chiamata per poi dare un 500 che non spiega niente. Deve stare DOPO i due
// health check (che devono rispondere anche a database spento) e PRIMA di tutti i router.
app.use(requireDb);

app.use('/auth', authRouter);
app.use('/matches', matchesRouter);
app.use('/stats', statsRouter);
app.use('/freeze', freezeRouter);

app.listen(PORT, () => {
  console.log(`Calcio Balilla backend in ascolto su http://localhost:${PORT}`);
});
