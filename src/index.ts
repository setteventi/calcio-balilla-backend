import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
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

app.use('/auth', authRouter);
app.use('/matches', matchesRouter);
app.use('/stats', statsRouter);
app.use('/freeze', freezeRouter);

app.listen(PORT, () => {
  console.log(`Calcio Balilla backend in ascolto su http://localhost:${PORT}`);
});
