import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET as string;
const isProd = process.env.NODE_ENV === 'production';
const PIN_REGEX = /^\d{4}$/;

export const authRouter = Router();

function issueSession(res: import('express').Response, playerId: string, name: string) {
  const token = jwt.sign({ playerId, name }, JWT_SECRET, { expiresIn: '180d' });
  res.cookie('session', token, {
    httpOnly: true,
    secure: isProd,
    // Il browser parla sempre con il dominio del frontend (proxy /api in next.config.ts),
    // quindi dal suo punto di vista è same-site: Lax basta, non serve None.
    sameSite: 'lax',
    maxAge: 180 * 24 * 60 * 60 * 1000,
  });
}

// Lista nomi per il selettore di login (nessun dato sensibile)
authRouter.get('/players', async (_req, res) => {
  const { data, error } = await supabase.from('players').select('id, name').order('name');
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

authRouter.post('/login', async (req, res) => {
  const { playerId, pin } = req.body as { playerId?: string; pin?: string };
  if (!playerId || !pin) {
    res.status(400).json({ error: 'playerId e pin sono obbligatori' });
    return;
  }

  const { data: player, error } = await supabase
    .from('players')
    .select('id, name, pin_hash')
    .eq('id', playerId)
    .single();

  if (error || !player) {
    res.status(401).json({ error: 'Giocatore o PIN non validi' });
    return;
  }

  const pinMatches = await bcrypt.compare(pin, player.pin_hash);
  if (!pinMatches) {
    res.status(401).json({ error: 'Giocatore o PIN non validi' });
    return;
  }

  issueSession(res, player.id, player.name);
  res.json({ id: player.id, name: player.name });
});

authRouter.post('/register', async (req, res) => {
  const { name, pin } = req.body as { name?: string; pin?: string };
  const trimmedName = name?.trim();

  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 30) {
    res.status(400).json({ error: 'Il nome deve avere tra 2 e 30 caratteri' });
    return;
  }
  if (!pin || !PIN_REGEX.test(pin)) {
    res.status(400).json({ error: 'Il PIN deve essere di 4 cifre' });
    return;
  }

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .ilike('name', trimmedName)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: 'Questo nome è già in uso, scegline un altro' });
    return;
  }

  const pin_hash = await bcrypt.hash(pin, 10);
  const { data: player, error } = await supabase
    .from('players')
    .insert({ name: trimmedName, pin_hash })
    .select('id, name')
    .single();

  if (error || !player) {
    res.status(500).json({ error: error?.message || 'Errore nella creazione del giocatore' });
    return;
  }

  issueSession(res, player.id, player.name);
  res.status(201).json({ id: player.id, name: player.name });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ id: req.playerId, name: req.playerName });
});

authRouter.put('/me', requireAuth, async (req: AuthedRequest, res) => {
  const { currentPin, newName, newPin } = req.body as {
    currentPin?: string;
    newName?: string;
    newPin?: string;
  };

  if (!currentPin) {
    res.status(400).json({ error: 'Inserisci il PIN attuale per confermare le modifiche' });
    return;
  }
  const trimmedName = newName?.trim();
  if (!trimmedName && !newPin) {
    res.status(400).json({ error: 'Nessuna modifica da salvare' });
    return;
  }
  if (trimmedName && (trimmedName.length < 2 || trimmedName.length > 30)) {
    res.status(400).json({ error: 'Il nome deve avere tra 2 e 30 caratteri' });
    return;
  }
  if (newPin && !PIN_REGEX.test(newPin)) {
    res.status(400).json({ error: 'Il nuovo PIN deve essere di 4 cifre' });
    return;
  }

  const { data: player, error } = await supabase
    .from('players')
    .select('id, name, pin_hash')
    .eq('id', req.playerId)
    .single();

  if (error || !player) {
    res.status(404).json({ error: 'Giocatore non trovato' });
    return;
  }

  const pinMatches = await bcrypt.compare(currentPin, player.pin_hash);
  if (!pinMatches) {
    res.status(401).json({ error: 'PIN attuale errato' });
    return;
  }

  if (trimmedName && trimmedName !== player.name) {
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .ilike('name', trimmedName)
      .neq('id', player.id)
      .maybeSingle();
    if (existing) {
      res.status(409).json({ error: 'Questo nome è già in uso, scegline un altro' });
      return;
    }
  }

  const update: { name?: string; pin_hash?: string } = {};
  if (trimmedName) update.name = trimmedName;
  if (newPin) update.pin_hash = await bcrypt.hash(newPin, 10);

  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update(update)
    .eq('id', player.id)
    .select('id, name')
    .single();

  if (updateError || !updated) {
    res.status(500).json({ error: updateError?.message || 'Errore nel salvataggio' });
    return;
  }

  issueSession(res, updated.id, updated.name);
  res.json({ id: updated.id, name: updated.name });
});
