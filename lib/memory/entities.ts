/**
 * Entity resolution & extraction parsing — Phase 3, Layer 5.
 *
 * Turns flat facts into a graph: entities (nodes) + typed relations (edges).
 * The hard part is *resolution* — recognizing that "John from Zap", "John
 * Smith", and "J. Smith @ Zap Corp" are one node, not three. Get this wrong and
 * the graph fragments (three lonely Johns) or over-merges (every "John" is one
 * person). This module is the deterministic, unit-tested resolution core.
 *
 * The LLM *extraction* itself (text → entities+relations) is a separate,
 * mockable step whose quality needs the funded key to validate; here we own the
 * parse of its output and the resolution of what it returns — both pure.
 */

/** A raw entity as extracted from text. */
export interface ExtractedEntity {
    name: string;
    type: string;
}

/** A raw relation between two entity names as extracted from text. */
export interface ExtractedRelation {
    source: string;
    relation: string;
    target: string;
}

export interface EntityExtraction {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
}

/** An entity already stored, for resolution comparison. */
export interface ExistingEntity {
    id: string;
    name: string;
    entityType: string;
    canonicalKey: string;
    aliases: string[];
}

export type ResolveResult =
    | { action: 'merge'; entityId: string; reason: 'exact' | 'alias' | 'fuzzy'; addAlias: string | null }
    | { action: 'create'; canonicalKey: string };

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Canonical identity of an entity = normalized name + type. */
export function normalizeEntityKey(name: string, type: string): string {
    return `${normalizeName(name)}|${type.toLowerCase().trim()}`;
}

function tokens(name: string): Set<string> {
    return new Set(normalizeName(name).split(' ').filter(t => t.length >= 2));
}

/** Is one token set a subset of the other, sharing at least one token? */
function subsetOverlap(a: Set<string>, b: Set<string>): boolean {
    if (a.size === 0 || b.size === 0) return false;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const t of small) if (!large.has(t)) return false;
    return true; // every token of the smaller is in the larger
}

/**
 * Decide whether an extracted entity is one we already know (merge) or new
 * (create). Order of confidence: exact canonical key → known alias → same-type
 * name containment ("John" ⊆ "John Smith"). Fuzzy matching is intentionally
 * conservative and type-gated to avoid collapsing distinct entities.
 */
export function resolveEntity(candidate: ExtractedEntity, existing: ExistingEntity[]): ResolveResult {
    const canonicalKey = normalizeEntityKey(candidate.name, candidate.type);
    const candNorm = normalizeName(candidate.name);

    // 1. Exact canonical identity.
    const exact = existing.find(e => e.canonicalKey === canonicalKey);
    if (exact) return { action: 'merge', entityId: exact.id, reason: 'exact', addAlias: null };

    // 2. Known alias (either direction), same type.
    const aliasMatch = existing.find(e =>
        e.entityType === candidate.type &&
        (e.aliases.some(a => normalizeName(a) === candNorm) || normalizeName(e.name) === candNorm)
    );
    if (aliasMatch) {
        const known = normalizeName(aliasMatch.name) === candNorm ||
            aliasMatch.aliases.some(a => normalizeName(a) === candNorm);
        return { action: 'merge', entityId: aliasMatch.id, reason: 'alias', addAlias: known ? null : candidate.name };
    }

    // 3. Fuzzy: same type, one name's tokens contained in the other's. Pick the
    // existing with the most tokens (most specific) when several qualify.
    const candTokens = tokens(candidate.name);
    const fuzzy = existing
        .filter(e => e.entityType === candidate.type && subsetOverlap(candTokens, tokens(e.name)))
        .sort((a, b) => tokens(b.name).size - tokens(a.name).size)[0];
    if (fuzzy) {
        // Add the candidate surface form as an alias if it isn't the canonical name.
        const addAlias = normalizeName(fuzzy.name) === candNorm ? null : candidate.name;
        return { action: 'merge', entityId: fuzzy.id, reason: 'fuzzy', addAlias };
    }

    return { action: 'create', canonicalKey };
}

/**
 * Defensive parse of the extraction model's output. Never throws; drops
 * anything malformed. Expected shape:
 *   {"entities":[{"name":"...","type":"..."}],
 *    "relations":[{"source":"...","relation":"...","target":"..."}]}
 */
export function parseEntityExtraction(raw: string): EntityExtraction {
    const empty: EntityExtraction = { entities: [], relations: [] };
    if (!raw) return empty;

    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) text = obj[0];

    let parsed: { entities?: unknown; relations?: unknown };
    try {
        parsed = JSON.parse(text);
    } catch {
        return empty;
    }
    if (!parsed || typeof parsed !== 'object') return empty;

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    const entities: ExtractedEntity[] = Array.isArray(parsed.entities)
        ? parsed.entities
            .map((e): ExtractedEntity | null => {
                if (!e || typeof e !== 'object') return null;
                const name = str((e as Record<string, unknown>).name);
                if (!name) return null;
                const type = str((e as Record<string, unknown>).type) || 'entity';
                return { name, type };
            })
            .filter((e): e is ExtractedEntity => e !== null)
        : [];

    const relations: ExtractedRelation[] = Array.isArray(parsed.relations)
        ? parsed.relations
            .map((r): ExtractedRelation | null => {
                if (!r || typeof r !== 'object') return null;
                const row = r as Record<string, unknown>;
                const source = str(row.source);
                const relation = str(row.relation);
                const target = str(row.target);
                if (!source || !relation || !target || source === target) return null;
                return { source, relation, target };
            })
            .filter((r): r is ExtractedRelation => r !== null)
        : [];

    return { entities, relations };
}
