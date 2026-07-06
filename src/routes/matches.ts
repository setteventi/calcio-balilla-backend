import { Router } from 'express';
import { supabase } from '../db/supabase';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { CreateMatchInput, MatchRole } from '../types';

export const matchesRouter = Router();

const VALID_ROLES: MatchRole[] = ['attacco', 'difesa', 'misto'];

const MATCH_SELECT = `id, played_at, winner_team, score_a, score_b, created_by_player_id,
   team_a_player1_id, team_a_player1_role, team_a_player2_id, team_a_player2_role,
   team_b_player1_id, team_b_player1_role, team_b_player2_id, team_b_player2_role,
   team_a_player1:players!matches_team_a_player1_id_fkey(id, name),
   team_a_player2:players!matches_team_a_player2_id_fkey(id, name),
   team_b_player1:players!matches_team_b_player1_id_fkey(id, name),
   team_b_player2:players!matches_team_b_player2_id_fkey(id, name)`;

function validateMatchInput(body: CreateMatchInput): string | null {
  const requiredIds = [
    body.team_a_player1_id,
    body.team_a_player2_id,
    body.team_b_player1_id,
    body.team_b_player2_id,
  ];
  const requiredRoles = [
    body.team_a_player1_role,
    body.team_a_player2_role,
    body.team_b_player1_role,
    body.team_b_player2_role,
  ];

  if (requiredIds.some((id) => !id) || requiredRoles.some((role) => !VALID_ROLES.includes(role))) {
    return 'Squadre, ruoli e vincitore sono obbligatori';
  }
  if (new Set(requiredIds).size !== 4) {
    return 'I 4 giocatori devono essere distinti';
  }
  if (body.winner_team !== 'A' && body.winner_team !== 'B') {
    return 'winner_team deve essere A o B';
  }

  const hasScoreA = body.score_a !== undefined && body.score_a !== null;
  const hasScoreB = body.score_b !== undefined && body.score_b !== null;
  if (hasScoreA !== hasScoreB) {
    return 'Inserisci il punteggio di entrambe le squadre, o di nessuna';
  }
  if (hasScoreA && hasScoreB) {
    const scoreA = Number(body.score_a);
    const scoreB = Number(body.score_b);
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
      return 'Il punteggio deve essere un numero intero non negativo';
    }
    if (scoreA === scoreB) {
      return 'Non può esserci pareggio';
    }
    const scoreWinner = scoreA > scoreB ? 'A' : 'B';
    if (scoreWinner !== body.winner_team) {
      return 'Il punteggio non è coerente con la squadra vincitrice selezionata';
    }
  }

  return null;
}

function matchRowFromInput(body: CreateMatchInput) {
  const hasScoreA = body.score_a !== undefined && body.score_a !== null;
  const hasScoreB = body.score_b !== undefined && body.score_b !== null;
  return {
    team_a_player1_id: body.team_a_player1_id,
    team_a_player1_role: body.team_a_player1_role,
    team_a_player2_id: body.team_a_player2_id,
    team_a_player2_role: body.team_a_player2_role,
    team_b_player1_id: body.team_b_player1_id,
    team_b_player1_role: body.team_b_player1_role,
    team_b_player2_id: body.team_b_player2_id,
    team_b_player2_role: body.team_b_player2_role,
    winner_team: body.winner_team,
    score_a: hasScoreA ? Number(body.score_a) : null,
    score_b: hasScoreB ? Number(body.score_b) : null,
  };
}

matchesRouter.use(requireAuth);

matchesRouter.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .order('played_at', { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

matchesRouter.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Partita non trovata' });
    return;
  }
  res.json(data);
});

matchesRouter.post('/', async (req: AuthedRequest, res) => {
  const body = req.body as CreateMatchInput;

  const validationError = validateMatchInput(body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const { data, error } = await supabase
    .from('matches')
    .insert({
      ...matchRowFromInput(body),
      created_by_player_id: req.playerId,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

matchesRouter.put('/:id', async (req: AuthedRequest, res) => {
  const body = req.body as CreateMatchInput;

  const validationError = validateMatchInput(body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const { data, error } = await supabase
    .from('matches')
    .update(matchRowFromInput(body))
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: error?.message || 'Partita non trovata' });
    return;
  }
  res.json(data);
});
