export type MatchRole = 'attacco' | 'difesa' | 'misto';
export type MatchWinner = 'A' | 'B';

export interface Player {
  id: string;
  name: string;
  pin_hash: string;
  created_at: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  played_at: string;
  team_a_player1_id: string;
  team_a_player1_role: MatchRole;
  team_a_player2_id: string;
  team_a_player2_role: MatchRole;
  team_b_player1_id: string;
  team_b_player1_role: MatchRole;
  team_b_player2_id: string;
  team_b_player2_role: MatchRole;
  winner_team: MatchWinner;
  score_a: number | null;
  score_b: number | null;
  created_by_player_id: string;
  created_at: string;
}

export interface CreateMatchInput {
  team_a_player1_id: string;
  team_a_player1_role: MatchRole;
  team_a_player2_id: string;
  team_a_player2_role: MatchRole;
  team_b_player1_id: string;
  team_b_player1_role: MatchRole;
  team_b_player2_id: string;
  team_b_player2_role: MatchRole;
  winner_team: MatchWinner;
  score_a?: number | null;
  score_b?: number | null;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  weightShare: number; // partite del player / totale partite del gruppo
  elo: number;
  attackWinRate: number | null;
  attackMatches: number;
  defenseWinRate: number | null;
  defenseMatches: number;
}

export interface PairStats {
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  matchesTogether: number;
  winsTogether: number;
  winRateTogether: number;
  synergyScore: number | null; // null se sotto soglia minima
  belowThreshold: boolean;
}

export interface HeadToHeadStats {
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  matchesAgainst: number;
  aWinsAgainstB: number;
  aWinRateAgainstB: number;
  belowThreshold: boolean;
}

export interface MatchTimelineEntry {
  matchId: string;
  playedAt: string;
  scoreA: number | null;
  scoreB: number | null;
  eloAfter: Record<string, number>;
}

export interface DaysAtTopEntry {
  playerId: string;
  name: string;
  days: number; // giorni totali trascorsi da n.1 in classifica ELO
  isCurrent: boolean; // è il n.1 attuale
}
