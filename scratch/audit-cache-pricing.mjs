// Throwaway read-only audit: which active model_pricing rows have no cache-read rate?
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.trim().startsWith('#'))
        .map(l => {
            const i = l.indexOf('=');
            return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(
    `${url}/rest/v1/model_pricing?select=provider,model_name,input_price_per_1k_tokens,output_price_per_1k_tokens,cached_input_price_per_1k_tokens,is_active,pricing_source_url&is_active=eq.true&order=provider,model_name`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);

if (!res.ok) {
    console.error('HTTP', res.status, await res.text());
    process.exit(1);
}

const rows = await res.json();
const nullCache = rows.filter(r => r.cached_input_price_per_1k_tokens === null);

console.log(`active rows: ${rows.length}, null cache rate: ${nullCache.length}\n`);
console.log('--- NULL cached_input_price_per_1k_tokens ---');
for (const r of nullCache) {
    console.log(
        `${r.provider.padEnd(12)} ${r.model_name.padEnd(28)} in=$${(r.input_price_per_1k_tokens * 1000).toFixed(2)}/1M out=$${(r.output_price_per_1k_tokens * 1000).toFixed(2)}/1M`
    );
}
console.log('\n--- has a cache rate (for contrast) ---');
for (const r of rows.filter(r => r.cached_input_price_per_1k_tokens !== null)) {
    const ratio = r.input_price_per_1k_tokens / r.cached_input_price_per_1k_tokens;
    console.log(
        `${r.provider.padEnd(12)} ${r.model_name.padEnd(28)} in=$${(r.input_price_per_1k_tokens * 1000).toFixed(2)}/1M cache=$${(r.cached_input_price_per_1k_tokens * 1000).toFixed(3)}/1M (1/${ratio.toFixed(1)})`
    );
}
