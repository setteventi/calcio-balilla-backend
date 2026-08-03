-- Calcio Balilla Tracker — schema Supabase (Postgres)

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create type match_role as enum ('attacco', 'difesa', 'misto');
create type match_winner as enum ('A', 'B');

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null default now(),

  team_a_player1_id uuid not null references players(id),
  team_a_player1_role match_role not null,
  team_a_player2_id uuid not null references players(id),
  team_a_player2_role match_role not null,

  team_b_player1_id uuid not null references players(id),
  team_b_player1_role match_role not null,
  team_b_player2_id uuid not null references players(id),
  team_b_player2_role match_role not null,

  winner_team match_winner not null,

  -- punteggio esatto, opzionale
  score_a int,
  score_b int,

  created_by_player_id uuid not null references players(id),
  created_at timestamptz not null default now(),

  constraint distinct_players check (
    team_a_player1_id <> team_a_player2_id and
    team_b_player1_id <> team_b_player2_id and
    team_a_player1_id <> team_b_player1_id and
    team_a_player1_id <> team_b_player2_id and
    team_a_player2_id <> team_b_player1_id and
    team_a_player2_id <> team_b_player2_id
  )
);

create index if not exists idx_matches_played_at on matches (played_at desc);
create index if not exists idx_matches_team_a_p1 on matches (team_a_player1_id);
create index if not exists idx_matches_team_a_p2 on matches (team_a_player2_id);
create index if not exists idx_matches_team_b_p1 on matches (team_b_player1_id);
create index if not exists idx_matches_team_b_p2 on matches (team_b_player2_id);

-- Periodi di "freeze" (es. pausa estiva): i giorni compresi non vengono conteggiati
-- nella classifica "Giorni da n.1". Date-calendario inclusive.
create table if not exists freeze_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint valid_range check (end_date >= start_date)
);
