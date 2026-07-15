/**
 * Rename orgs with random-shape slugs (from legacy `generateSlug()`) to
 * kebab-case slugs derived from the org name.
 *
 * DRY RUN by default. Prints exactly what would change without touching
 * the database. Pass `--apply` to actually run the updates.
 *
 * Usage:
 *   npx tsx scripts/rename-random-org-slugs.ts          # dry run
 *   npx tsx scripts/rename-random-org-slugs.ts --apply  # apply changes
 *
 * Detection: matches slugs that are exactly 20 lowercase-alphanumeric
 * characters with no hyphens — the exact shape produced by
 * `generateSlug()` in lib/utils.ts. Slugs that happen to be short single
 * words are left alone.
 *
 * Conflict handling: if the slugified name is already taken (by another
 * org), we append -2, -3, etc. until a free slug is found. Same policy as
 * app/onboarding/page.tsx.
 *
 * Reserved slugs (from lib/reserved-slugs.ts) are also skipped and get
 * a `-1` suffix.
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

// Reserved list — kept in sync with lib/reserved-slugs.ts.
// Deliberately duplicated here rather than imported so this script has
// no dependency on the app tree's build.
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

function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/-+/g, '-');
}

interface OrgRow {
    id: string;
    name: string | null;
    slug: string;
    created_at: string;
}

const APPLY = process.argv.includes('--apply');

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[rename-org-slugs] target: ${supabaseUrl}`);
    console.log(`[rename-org-slugs] mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log('');

    // Fetch every org — we'll filter for random-shape slugs client-side.
    const { data: allOrgs, error } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Failed to load organizations:', error.message);
        process.exit(1);
    }

    const orgs = (allOrgs as OrgRow[]) || [];
    console.log(`Loaded ${orgs.length} organizations total.`);

    const random = orgs.filter((o) => RANDOM_SLUG_PATTERN.test(o.slug));
    console.log(`Found ${random.length} orgs with random-shape slugs.`);
    console.log('');

    if (random.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    // Build an in-memory set of every existing slug so we can detect conflicts
    // as we plan renames without re-querying the DB per row.
    const takenSlugs = new Set(orgs.map((o) => o.slug));

    interface Plan {
        id: string;
        name: string | null;
        from: string;
        to: string;
        reason: 'renamed' | 'conflict-resolved' | 'reserved-avoided' | 'no-name' | 'unchanged';
    }

    const plan: Plan[] = [];

    for (const org of random) {
        if (!org.name || !org.name.trim()) {
            plan.push({
                id: org.id,
                name: org.name,
                from: org.slug,
                to: org.slug,
                reason: 'no-name',
            });
            continue;
        }

        const base = slugify(org.name) || 'org';
        let candidate = base;
        let reason: Plan['reason'] = 'renamed';

        if (RESERVED.has(candidate)) {
            reason = 'reserved-avoided';
        }

        let i = 1;
        while (RESERVED.has(candidate) || (takenSlugs.has(candidate) && candidate !== org.slug)) {
            i += 1;
            candidate = `${base}-${i}`;
            if (i > 100) {
                candidate = `${base}-${Date.now()}`;
                break;
            }
            if (reason === 'renamed') reason = 'conflict-resolved';
        }

        if (candidate === org.slug) {
            plan.push({ id: org.id, name: org.name, from: org.slug, to: org.slug, reason: 'unchanged' });
            continue;
        }

        // Reserve the new slug in the local set so subsequent iterations
        // don't try to take the same one.
        takenSlugs.delete(org.slug);
        takenSlugs.add(candidate);

        plan.push({
            id: org.id,
            name: org.name,
            from: org.slug,
            to: candidate,
            reason,
        });
    }

    console.log('Rename plan:');
    console.log('');
    const nameCol = Math.min(28, Math.max(...plan.map((p) => (p.name || '<no name>').length)));
    for (const p of plan) {
        const displayName = (p.name || '<no name>').padEnd(nameCol);
        const arrow = p.reason === 'no-name' || p.reason === 'unchanged' ? '   ' : ' → ';
        console.log(
            `  ${displayName}  ${p.from.padEnd(20)}${arrow}${p.to.padEnd(28)}  [${p.reason}]`
        );
    }
    console.log('');

    const willChange = plan.filter((p) => p.from !== p.to);
    console.log(`Summary: ${willChange.length} of ${random.length} random-slug orgs would be renamed.`);

    const skipped = plan.filter((p) => p.reason === 'no-name');
    if (skipped.length > 0) {
        console.log(`${skipped.length} skipped: no org name to slugify from.`);
    }

    if (!APPLY) {
        console.log('');
        console.log('Dry run only. Re-run with --apply to commit these changes.');
        return;
    }

    console.log('');
    console.log('Applying...');
    let ok = 0;
    let failed = 0;
    for (const p of willChange) {
        const { error } = await supabase
            .from('organizations')
            .update({ slug: p.to })
            .eq('id', p.id);
        if (error) {
            console.error(`  FAIL ${p.from} → ${p.to}:`, error.message);
            failed += 1;
        } else {
            console.log(`  ok   ${p.from} → ${p.to}`);
            ok += 1;
        }
    }
    console.log('');
    console.log(`Done. ${ok} succeeded, ${failed} failed.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
