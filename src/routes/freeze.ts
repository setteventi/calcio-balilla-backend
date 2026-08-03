import { Router } from 'express';
import { supabase } from '../db/supabase';
import { requireAuth } from '../middleware/auth';

export const freezeRouter = Router();

freezeRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

freezeRouter.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('freeze_periods')
    .select('id, start_date, end_date, created_at')
    .order('start_date', { ascending: true });

  // Tollerante: se la tabella non esiste ancora (migrazione non eseguita),
  // restituisce [] invece di 500, così la pagina Analisi non si rompe.
  if (error) {
    res.json([]);
    return;
  }
  res.json(data ?? []);
});

freezeRouter.post('/', async (req, res) => {
  const { start_date, end_date } = req.body as { start_date?: string; end_date?: string };

  if (!start_date || !end_date || !DATE_RE.test(start_date) || !DATE_RE.test(end_date)) {
    res.status(400).json({ error: 'Date non valide (formato atteso YYYY-MM-DD)' });
    return;
  }
  if (end_date < start_date) {
    res.status(400).json({ error: 'La data di fine deve essere uguale o successiva a quella di inizio' });
    return;
  }

  const { data, error } = await supabase
    .from('freeze_periods')
    .insert({ start_date, end_date })
    .select('id, start_date, end_date, created_at')
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

freezeRouter.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('freeze_periods')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error || !data) {
    res.status(404).json({ error: error?.message || 'Periodo non trovato' });
    return;
  }
  res.json({ ok: true, id: data.id });
});
