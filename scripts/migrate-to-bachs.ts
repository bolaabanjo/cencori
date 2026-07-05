/**
 * Migration script: creates Bachs customers for existing organizations
 * and migrates them from Polar to Bachs.
 *
 * Usage: npx tsx scripts/migrate-to-bachs.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bachsApiKey = process.env.BACHS_API_KEY!;
const bachsApiBase = process.env.BACHS_API_BASE || 'https://api.bachs.io/v1';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createBachsCustomer(email: string, name?: string) {
  const res = await fetch(`${bachsApiBase}/customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bachsApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bachs API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return { id: data.customer_id, email: data.email, name: data.name };
}

async function run() {
  console.log('Fetching organizations without bachs_customer_id...');

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, billing_email, bachs_customer_id')
    .is('bachs_customer_id', null);

  if (error) {
    console.error('Error fetching orgs:', error);
    process.exit(1);
  }

  console.log(`Found ${orgs.length} organizations to migrate.`);

  for (const org of orgs) {
    const email = org.billing_email || `billing+${org.slug}@cencori.com`;

    try {
      console.log(`Creating Bachs customer for ${org.name} (${email})...`);
      const customer = await createBachsCustomer(email, org.name);
      console.log(`  → Customer created: ${customer.id} (${customer.email})`);

      const { error: updateError } = await supabase
        .from('organizations')
        .update({ bachs_customer_id: customer.id })
        .eq('id', org.id);

      if (updateError) {
        console.error(`  ✗ Failed to update DB: ${updateError.message}`);
      } else {
        console.log(`  ✓ bachs_customer_id set to ${customer.id}`);
      }
    } catch (err) {
      console.error(`  ✗ Failed for ${org.name}:`, err);
    }
  }

  console.log('\nMigration complete.');
}

run();
