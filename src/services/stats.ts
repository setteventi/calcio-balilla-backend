import { supabase } from '../db/supabase';
import {
  DaysAtTopEntry,
  HeadToHeadStats,
  Match,
  MatchRole,
  MatchTimelineEntry,
  PairStats,
  PlayerPublic,
  PlayerStats,
} from '../types';

const TIMEZONE = 'Europe/Rome';

// YYYY-MM-DD della data locale italiana per un istante ISO.
function romeDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

// Tutte le date-calendario (YYYY-MM-DD) da `fromYmd` a `toYmd` incluse.
// Aritmetica in UTC su date "nude": conta i giorni-calendario senza problemi di DST.
function eachDay(fromYmd: string, toYmd: string): string[] {
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const out: string[] = [];
  const end = parse(toYmd);
  for (let cur = parse(fromYmd); cur <= end; cur += 86_400_000) {
    out.push(new Date(cur).toISOString().slice(0, 10));
  }
  return out;
}

const ELO_START = 1000;
const ELO_K = 32;
const ELO_MARGIN_MAX_MULTIPLIER = 3;
const PAIR_MIN_MATCHES = 3;
const H2H_MIN_MATCHES = 3;

// Senza punteggio esatto il margine non è noto: multiplier neutro (1x, comportamento invariato).
// Con punteggio, il delta ELO cresce con lo scarto (log per smorzare vittorie schiaccianti su poche partite).
function marginMultiplier(scoreA: number | null, scoreB: number | null): number {
  if (scoreA === null || scoreB === null) return 1;
  const margin = Math.abs(scoreA - scoreB);
  if (margin <= 1) return 1;
  return Math.min(ELO_MARGIN_MAX_MULTIPLIER, Math.log2(margin + 1));
}

interface RoleTally {
  attackMatches: number;
  attackWins: number;
  defenseMatches: number;
  defenseWins: number;
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('|');
}

function applyRole(tally: RoleTally, role: MatchRole, won: boolean) {
  const weight = role === 'misto' ? 0.5 : 1;
  if (role === 'attacco' || role === 'misto') {
    tally.attackMatches += weight;
    if (won) tally.attackWins += weight;
  }
  if (role === 'difesa' || role === 'misto') {
    tally.defenseMatches += weight;
    if (won) tally.defenseWins += weight;
  }
}

async function fetchAllPlayersAndMatches(): Promise<{ players: PlayerPublic[]; matches: Match[] }> {
  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([
    supabase.from('players').select('id, name').order('name'),
    supabase.from('matches').select('*').order('played_at', { ascending: true }),
  ]);

  if (playersError) throw new Error(playersError.message);
  if (matchesError) throw new Error(matchesError.message);

  return { players: players ?? [], matches: (matches ?? []) as Match[] };
}

interface EloSimulation {
  finalElo: Map<string, number>;
  matchesPlayed: Map<string, number>;
  wins: Map<string, number>;
  roleTally: Map<string, RoleTally>;
  timeline: MatchTimelineEntry[];
}

// Rigioca tutte le partite in ordine cronologico, aggiornando ELO/partite/ruoli
// passo dopo passo. Un solo replay condiviso da computePlayerStats (che usa solo
// il rating finale) e computeMatchTimeline (che usa anche gli snapshot intermedi).
function simulateElo(players: PlayerPublic[], matches: Match[]): EloSimulation {
  const elo = new Map(players.map((p) => [p.id, ELO_START]));
  const matchesPlayed = new Map(players.map((p) => [p.id, 0]));
  const wins = new Map(players.map((p) => [p.id, 0]));
  const roleTally = new Map<string, RoleTally>(
    players.map((p) => [p.id, { attackMatches: 0, attackWins: 0, defenseMatches: 0, defenseWins: 0 }])
  );
  const timeline: MatchTimelineEntry[] = [];

  for (const m of matches) {
    const teamA = [
      { id: m.team_a_player1_id, role: m.team_a_player1_role },
      { id: m.team_a_player2_id, role: m.team_a_player2_role },
    ];
    const teamB = [
      { id: m.team_b_player1_id, role: m.team_b_player1_role },
      { id: m.team_b_player2_id, role: m.team_b_player2_role },
    ];
    const aWon = m.winner_team === 'A';

    for (const { id } of [...teamA, ...teamB]) {
      matchesPlayed.set(id, (matchesPlayed.get(id) ?? 0) + 1);
    }
    for (const { id } of teamA) if (aWon) wins.set(id, (wins.get(id) ?? 0) + 1);
    for (const { id } of teamB) if (!aWon) wins.set(id, (wins.get(id) ?? 0) + 1);

    for (const { id, role } of teamA) applyRole(roleTally.get(id)!, role, aWon);
    for (const { id, role } of teamB) applyRole(roleTally.get(id)!, role, !aWon);

    // ELO: rating di squadra = media dei due, delta diviso tra i membri
    const ratingA = (elo.get(teamA[0].id)! + elo.get(teamA[1].id)!) / 2;
    const ratingB = (elo.get(teamB[0].id)! + elo.get(teamB[1].id)!) / 2;
    const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    const actualA = aWon ? 1 : 0;
    const multiplier = marginMultiplier(m.score_a, m.score_b);
    const deltaA = ELO_K * multiplier * (actualA - expectedA);

    for (const { id } of teamA) elo.set(id, elo.get(id)! + deltaA / 2);
    for (const { id } of teamB) elo.set(id, elo.get(id)! - deltaA / 2);

    timeline.push({
      matchId: m.id,
      playedAt: m.played_at,
      scoreA: m.score_a,
      scoreB: m.score_b,
      eloAfter: Object.fromEntries([...elo.entries()].map(([id, rating]) => [id, Math.round(rating)])),
    });
  }

  return { finalElo: elo, matchesPlayed, wins, roleTally, timeline };
}

export async function computeMatchTimeline(): Promise<MatchTimelineEntry[]> {
  const { players, matches } = await fetchAllPlayersAndMatches();
  return simulateElo(players, matches).timeline;
}

// Giorni trascorsi da n.1 assoluto (top ELO), stile "settimane da numero 1" del tennis.
// Ad ogni partita ricalcola chi è in vetta; ogni giorno-calendario viene attribuito
// al n.1 di fine giornata, portando avanti il leader nei giorni senza partite —
// così la classifica cresce da sola giorno dopo giorno anche se non si gioca.
export async function computeDaysAtTop(): Promise<DaysAtTopEntry[]> {
  const { players, matches } = await fetchAllPlayersAndMatches();
  const { timeline } = simulateElo(players, matches);
  if (timeline.length === 0) return [];

  const nameById = new Map(players.map((p) => [p.id, p.name]));

  // Leader unico di fine giornata per ogni data con almeno una partita.
  // Sui pareggi in vetta resta l'incumbent; se viene scavalcato da un pareggio
  // multiplo, quel periodo non ha un n.1 unico (nessuno se ne prende il merito).
  const endOfDayLeader = new Map<string, string | null>();
  let incumbent: string | null = null;

  for (const entry of timeline) {
    const elo = entry.eloAfter;
    const maxVal = Math.max(...Object.values(elo));
    const leaders = Object.keys(elo).filter((id) => elo[id] === maxVal);

    if (leaders.length === 1) incumbent = leaders[0];
    else if (!(incumbent && leaders.includes(incumbent))) incumbent = null;
    // (se l'incumbent è ancora tra i pari-vetta, mantiene la corona)

    endOfDayLeader.set(romeDate(entry.playedAt), incumbent);
  }

  const firstDay = romeDate(timeline[0].playedAt);
  const today = romeDate(new Date());

  const days = new Map<string, number>();
  let carried: string | null = null;
  for (const day of eachDay(firstDay, today)) {
    if (endOfDayLeader.has(day)) carried = endOfDayLeader.get(day)!;
    if (carried) days.set(carried, (days.get(carried) ?? 0) + 1);
  }

  const currentLeader = carried;
  return [...days.entries()]
    .map(([playerId, count]) => ({
      playerId,
      name: nameById.get(playerId) ?? '?',
      days: count,
      isCurrent: playerId === currentLeader,
    }))
    .sort((a, b) => b.days - a.days);
}

export async function computePlayerStats(): Promise<PlayerStats[]> {
  const { players, matches } = await fetchAllPlayersAndMatches();
  const { finalElo: elo, matchesPlayed, wins, roleTally } = simulateElo(players, matches);

  const totalMatches = matches.length;

  return players
    .map((p) => {
      const played = matchesPlayed.get(p.id) ?? 0;
      const w = wins.get(p.id) ?? 0;
      const tally = roleTally.get(p.id)!;
      return {
        playerId: p.id,
        name: p.name,
        matchesPlayed: played,
        wins: w,
        losses: played - w,
        winRate: played > 0 ? w / played : 0,
        weightShare: totalMatches > 0 ? played / totalMatches : 0,
        elo: Math.round(elo.get(p.id) ?? ELO_START),
        attackWinRate: tally.attackMatches > 0 ? tally.attackWins / tally.attackMatches : null,
        attackMatches: tally.attackMatches,
        defenseWinRate: tally.defenseMatches > 0 ? tally.defenseWins / tally.defenseMatches : null,
        defenseMatches: tally.defenseMatches,
      } satisfies PlayerStats;
    })
    .sort((a, b) => b.elo - a.elo);
}

export async function computePairStats(): Promise<PairStats[]> {
  const { players, matches } = await fetchAllPlayersAndMatches();
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  const individualMatches = new Map<string, number>();
  const individualWins = new Map<string, number>();
  const pairMatches = new Map<string, number>();
  const pairWins = new Map<string, number>();

  for (const m of matches) {
    const teams = [
      { players: [m.team_a_player1_id, m.team_a_player2_id], won: m.winner_team === 'A' },
      { players: [m.team_b_player1_id, m.team_b_player2_id], won: m.winner_team === 'B' },
    ];
    for (const team of teams) {
      for (const id of team.players) {
        individualMatches.set(id, (individualMatches.get(id) ?? 0) + 1);
        if (team.won) individualWins.set(id, (individualWins.get(id) ?? 0) + 1);
      }
      const key = pairKey(team.players[0], team.players[1]);
      pairMatches.set(key, (pairMatches.get(key) ?? 0) + 1);
      if (team.won) pairWins.set(key, (pairWins.get(key) ?? 0) + 1);
    }
  }

  const results: PairStats[] = [];
  for (const [key, together] of pairMatches.entries()) {
    const [aId, bId] = key.split('|');
    const winsTogether = pairWins.get(key) ?? 0;
    const winRateTogether = together > 0 ? winsTogether / together : 0;
    const belowThreshold = together < PAIR_MIN_MATCHES;

    const aIndividualRate = (individualWins.get(aId) ?? 0) / (individualMatches.get(aId) ?? 1);
    const bIndividualRate = (individualWins.get(bId) ?? 0) / (individualMatches.get(bId) ?? 1);
    const synergyScore = belowThreshold
      ? null
      : winRateTogether - (aIndividualRate + bIndividualRate) / 2;

    results.push({
      playerAId: aId,
      playerAName: nameById.get(aId) ?? '?',
      playerBId: bId,
      playerBName: nameById.get(bId) ?? '?',
      matchesTogether: together,
      winsTogether,
      winRateTogether,
      synergyScore,
      belowThreshold,
    });
  }

  return results.sort((a, b) => (b.synergyScore ?? -1) - (a.synergyScore ?? -1));
}

export async function computeHeadToHeadStats(): Promise<HeadToHeadStats[]> {
  const { players, matches } = await fetchAllPlayersAndMatches();
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  // conteggi direzionali: per ogni ordered pair (a,b), quante volte a ha battuto b
  const matchesAgainst = new Map<string, number>();
  const winsFor = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string, n = 1) => map.set(key, (map.get(key) ?? 0) + n);

  for (const m of matches) {
    const teamA = [m.team_a_player1_id, m.team_a_player2_id];
    const teamB = [m.team_b_player1_id, m.team_b_player2_id];
    const aWon = m.winner_team === 'A';

    for (const a of teamA) {
      for (const b of teamB) {
        bump(matchesAgainst, pairKey(a, b));
        if (aWon) bump(winsFor, `${a}>${b}`);
        else bump(winsFor, `${b}>${a}`);
      }
    }
  }

  const results: HeadToHeadStats[] = [];
  const seen = new Set<string>();
  for (const key of matchesAgainst.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    const [aId, bId] = key.split('|');
    const total = matchesAgainst.get(key) ?? 0;
    const aWinsAgainstB = winsFor.get(`${aId}>${bId}`) ?? 0;

    results.push({
      playerAId: aId,
      playerAName: nameById.get(aId) ?? '?',
      playerBId: bId,
      playerBName: nameById.get(bId) ?? '?',
      matchesAgainst: total,
      aWinsAgainstB,
      aWinRateAgainstB: total > 0 ? aWinsAgainstB / total : 0,
      belowThreshold: total < H2H_MIN_MATCHES,
    });
  }

  return results;
}
