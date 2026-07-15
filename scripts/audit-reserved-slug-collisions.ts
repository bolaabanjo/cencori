/**
 * Audit org slugs against the reserved-word list.
 *
 * Reports any org whose slug would collide with a static route in the
 * new URL structure (`/enterprise`, `/memory`, `/security`, `/docs`,
 * etc.). Those orgs are unreachable via URL until they're renamed.
 *
 * Also flags orgs whose slug uses characters that would be malformed
 * in the new URL shape (uppercase, spaces, non-alphanumeric).
 *
 * Read-only. Prints a table. Doesn't modify anything.
 *
 * Usage: npx tsx scripts/audit-reserved-slug-collisions.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
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

// Reserved list — kept in sync with lib/reserved-slugs.ts. Duplicated
// intentionally so the script has zero app-tree dependencies.
const RESERVED = new Set<string>([
    '~', 'account', 'api', 'dashboard',
    'design', 'privacy-policy', 'terms-of-service',
    'about', 'arcie', 'blog', 'brand', 'careers', 'changelog', 'contact',
    'customers', 'developers', 'enterprise', 'events', 'examples',
    'manifesto', 'memory', 'partners', 'press', 'scan', 'security',
    'shipped', 'subscribe',
    'ai-gateway', 'audit', 'compute', 'developer-tools', 'edge',
    'insights', 'integration', 'product-knight', 'product-network',
    'product-sandbox', 'workflow',
    'academy', 'ai', 'chat', 'compare', 'docs', 'ekiti-demo', 'internal',
    'invite', 'login', 'newsletter', 'og', 'onboarding', 'pitch',
    'playground', 'preview', 'pricing', 'privacy', 'scan-app', 'signup',
    'solutions', 'team-invite', 'terms',
    'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json',
    'admin', 'settings', 'new', 'projects', 'billing', 'teams',
    'usage', 'integrations', 'audit-log', 'providers',
]);

const RANDOM_SLUG_PATTERN = /^[a-z0-9]{20}$/;
const VALID_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface OrgRow {
    id: string;
    name: string | null;
    slug: string;
    created_at: string;
    owner_id: string | null;
}

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[audit] target: ${supabaseUrl}`);
    console.log('');

    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at, owner_id')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Failed to load organizations:', error.message);
        process.exit(1);
    }

    const orgs = (data as OrgRow[]) || [];
    console.log(`Loaded ${orgs.length} organizations.`);
    console.log('');

    const random = orgs.filter((o) => RANDOM_SLUG_PATTERN.test(o.slug));
    const nonRandom = orgs.filter((o) => !RANDOM_SLUG_PATTERN.test(o.slug));
    console.log(`${random.length} random-shape slugs (generateSlug output — safe by construction).`);
    console.log(`${nonRandom.length} non-random slugs (need audit against reserved list).`);
    console.log('');

    // Reserved-word collisions.
    const reservedCollisions = nonRandom.filter((o) =>
        RESERVED.has(o.slug.toLowerCase())
    );

    // Format-invalid slugs (won't match ORG_SLUG_PATTERN — uppercase, spaces, etc).
    const formatInvalid = nonRandom.filter(
        (o) => !VALID_SLUG_PATTERN.test(o.slug) && !RANDOM_SLUG_PATTERN.test(o.slug)
    );

    // The "safe" non-random orgs.
    const safe = nonRandom.filter(
        (o) =>
            !RESERVED.has(o.slug.toLowerCase()) &&
            VALID_SLUG_PATTERN.test(o.slug)
    );

    if (reservedCollisions.length > 0) {
        console.log(`⚠️  ${reservedCollisions.length} RESERVED-WORD COLLISION(S):`);
        console.log('   These orgs will be unreachable via URL after ship.');
        console.log('');
        for (const o of reservedCollisions) {
            console.log(
                `    ${(o.name || '<no name>').padEnd(30)}  slug=${o.slug.padEnd(20)}  id=${o.id}`
            );
        }
        console.log('');
    }

    if (formatInvalid.length > 0) {
        console.log(`⚠️  ${formatInvalid.length} FORMAT-INVALID SLUG(S):`);
        console.log('   These slugs contain characters that don\'t fit the new URL shape.');
        console.log('');
        for (const o of formatInvalid) {
            console.log(
                `    ${(o.name || '<no name>').padEnd(30)}  slug="${o.slug}"  id=${o.id}`
            );
        }
        console.log('');
    }

    if (safe.length > 0) {
        console.log(`✓  ${safe.length} safe non-random slug(s):`);
        console.log('');
        for (const o of safe) {
            console.log(
                `    ${(o.name || '<no name>').padEnd(30)}  slug=${o.slug.padEnd(20)}  id=${o.id}`
            );
        }
        console.log('');
    }

    // Final summary
    console.log('---');
    if (reservedCollisions.length === 0 && formatInvalid.length === 0) {
        console.log('All non-random slugs are safe to ship. No renames required.');
    } else {
        console.log(
            `Action required: ${reservedCollisions.length + formatInvalid.length} org(s) need to be renamed before ship.`
        );
        console.log('');
        console.log('Suggested SQL to rename (edit new slug per org first):');
        for (const o of [...reservedCollisions, ...formatInvalid]) {
            const suggestedNew = o.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
            console.log(`  update public.organizations set slug = '${suggestedNew}-1' where id = '${o.id}';`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
