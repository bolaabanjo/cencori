/**
 * @vitest-environment node
 *
 * Public-benchmark loaders. Must convert LongMemEval/LoCoMo shapes into our
 * EvalScenario, mapping their categories to ours, pairing dialogue into
 * user/assistant turns, and never throwing on malformed input.
 */
import { describe, expect, it } from 'vitest';

import { loadLongMemEval, loadLoCoMo } from '../loaders';

describe('loadLongMemEval', () => {
    const raw = [
        {
            question_id: 'q1',
            question_type: 'knowledge-update',
            question: 'Where does the user work now?',
            answer: 'Northwind',
            haystack_sessions: [
                [{ role: 'user', content: 'I work at Zap.' }, { role: 'assistant', content: 'Noted.' }],
                [{ role: 'user', content: 'I moved to Northwind.' }, { role: 'assistant', content: 'Congrats.' }],
            ],
        },
        {
            question_id: 'q2_abs',
            question_type: 'single-session-user',
            question: 'What is the user\'s salary?',
            answer: 'The information is not mentioned.',
            haystack_sessions: [[{ role: 'user', content: 'I like hiking.' }]],
        },
        { question_id: 'q3', question_type: 'temporal-reasoning', question: 'When?', answer: 'March', haystack_sessions: [] },
    ];

    it('maps question types + abstention to our categories', () => {
        const out = loadLongMemEval(raw);
        expect(out).toHaveLength(3);
        expect(out[0].questions[0].category).toBe('contradiction'); // knowledge-update
        expect(out[1].questions[0].category).toBe('irrelevant');    // _abs → abstention
        expect(out[2].questions[0].category).toBe('temporal');
    });

    it('pairs session turns into user/assistant and carries gold answer', () => {
        const out = loadLongMemEval(raw);
        expect(out[0].transcript).toEqual([
            { user: 'I work at Zap.', assistant: 'Noted.' },
            { user: 'I moved to Northwind.', assistant: 'Congrats.' },
        ]);
        expect(out[0].questions[0].goldAnswer).toBe('Northwind');
        expect(out[0].userId).toBe('lme-q1');
    });

    it('skips malformed instances, tolerates empty input', () => {
        expect(loadLongMemEval([{ foo: 1 }, null, { question_id: 'x' /* no question */ }])).toEqual([]);
        expect(loadLongMemEval('nope')).toEqual([]);
    });
});

describe('loadLoCoMo', () => {
    const raw = [
        {
            sample_id: 's1',
            conversation: {
                speaker_a: 'Alice',
                speaker_b: 'Bob',
                session_2: [{ speaker: 'Alice', text: 'I adopted a dog.' }, { speaker: 'Bob', text: 'Cute!' }],
                session_1: [{ speaker: 'Alice', text: 'Hi Bob.' }, { speaker: 'Bob', text: 'Hey Alice.' }],
            },
            qa: [
                { question: 'How are Alice and Bob connected?', answer: 'friends', category: 1 },
                { question: 'When did Alice adopt a dog?', answer: 'session 2', category: 2 },
                { question: 'What is unknowable here?', answer: 'Not mentioned', category: 5 },
                { question: "Alice's pet?", answer: 'dog', category: 4 },
            ],
        },
    ];

    it('orders sessions numerically and flattens to paired turns', () => {
        const out = loadLoCoMo(raw);
        expect(out).toHaveLength(1);
        // session_1 must come before session_2
        expect(out[0].transcript[0]).toEqual({ user: 'Hi Bob.', assistant: 'Hey Alice.' });
        expect(out[0].transcript[1]).toEqual({ user: 'I adopted a dog.', assistant: 'Cute!' });
    });

    it('maps LoCoMo category codes to our categories', () => {
        const cats = loadLoCoMo(raw)[0].questions.map(q => q.category);
        expect(cats).toEqual(['multi', 'temporal', 'irrelevant', 'recall']);
    });

    it('carries gold answers (coercing non-strings) and unique ids', () => {
        const qs = loadLoCoMo(raw)[0].questions;
        expect(qs[3].goldAnswer).toBe('dog');
        expect(qs[0].id).toBe('s1-q0');
        expect(loadLoCoMo(raw)[0].userId).toBe('locomo-s1');
    });

    it('tolerates malformed input', () => {
        expect(loadLoCoMo('nope')).toEqual([]);
        expect(loadLoCoMo([{ sample_id: 's', conversation: {}, qa: [] }])).toEqual([]); // no questions → skipped
    });
});
