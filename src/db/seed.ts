import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { supabase } from './supabase';

// Facoltativo: l'app supporta la registrazione libera (POST /auth/register),
// quindi ogni giocatore può aggiungersi da solo scegliendo nome e PIN.
// Questo script serve solo se preferisci pre-creare tu gli account.
const PLAYERS: { name: string; pin: string }[] = [
  { name: 'Marco', pin: '1111' },
  { name: 'Luca', pin: '2222' },
];

async function main() {
  for (const p of PLAYERS) {
    const pin_hash = await bcrypt.hash(p.pin, 10);
    const { error } = await supabase.from('players').upsert(
      { name: p.name, pin_hash },
      { onConflict: 'name' }
    );
    if (error) {
      console.error(`Errore su ${p.name}:`, error.message);
    } else {
      console.log(`OK: ${p.name}`);
    }
  }
}

main().then(() => process.exit(0));
