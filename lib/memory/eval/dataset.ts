/**
 * The v1 memory benchmark. Small but adversarial: every category that
 * separates "vector store" from "memory" has at least one scenario. Grow this
 * over time — it is the artifact we publish as "the recall benchmark we win".
 *
 * Design notes:
 * - `contradiction` scenarios state a fact, then change it. A blind-insert
 *   store recalls BOTH values (forbiddenFacts present → fail). Layer-1
 *   reconciliation supersedes the stale one → pass.
 * - `leak` scenarios plant a secret in the transcript; redaction must ensure it
 *   never comes back.
 * - `irrelevant` scenarios probe a topic never discussed; a good store returns
 *   nothing rather than forcing a weak match.
 */

import type { EvalScenario } from './types';

export const BENCHMARK: EvalScenario[] = [
    {
        id: 'lang-switch',
        description: 'User changes their primary language; only the new one should be recalled.',
        userId: 'eval-lang-switch',
        transcript: [
            {
                user: 'I mostly build backend services in Python these days.',
                assistant: 'Python is a great choice for backend work.',
            },
            {
                user: 'Actually I switched everything over to Rust last month, no more Python for me.',
                assistant: 'Got it — Rust it is going forward.',
            },
        ],
        questions: [
            {
                id: 'lang-current',
                category: 'contradiction',
                query: 'What programming language do I use?',
                expectedFacts: ['Rust'],
                forbiddenFacts: ['Python'],
            },
        ],
    },
    {
        id: 'prefs-and-project',
        description: 'Durable preferences + project context recalled together.',
        userId: 'eval-prefs',
        transcript: [
            {
                user: 'I prefer dark mode in every tool, and I go by Sam.',
                assistant: 'Noted, Sam — dark mode everywhere.',
            },
            {
                user: "I'm building a fintech app called Ledgerkit for small businesses.",
                assistant: 'Ledgerkit sounds like a solid fintech project.',
            },
        ],
        questions: [
            {
                id: 'prefs-theme',
                category: 'recall',
                query: 'What UI theme do I prefer?',
                expectedFacts: ['dark'],
            },
            {
                id: 'prefs-project',
                category: 'recall',
                query: 'What am I building?',
                expectedFacts: ['Ledgerkit'],
            },
        ],
    },
    {
        id: 'employer-change',
        description: 'User leaves a job; the old employer must not be recalled as current.',
        userId: 'eval-employer',
        transcript: [
            { user: 'I work as a data engineer at Zap Corp.', assistant: 'Nice, data engineering at Zap Corp.' },
            {
                user: 'Update: I left Zap Corp and joined Northwind as a staff engineer.',
                assistant: 'Congrats on the move to Northwind!',
            },
        ],
        questions: [
            {
                id: 'employer-current',
                category: 'contradiction',
                query: 'Where do I work?',
                expectedFacts: ['Northwind'],
                forbiddenFacts: ['Zap Corp'],
            },
        ],
    },
    {
        id: 'secret-redaction',
        description: 'A credential stated in chat must never be stored or recalled.',
        userId: 'eval-secret',
        transcript: [
            {
                user: 'For reference my OpenAI key is sk-proj-abc123SECRETvalue and I deploy on Fridays.',
                assistant: "I won't store the key. Noted that you deploy on Fridays.",
            },
        ],
        questions: [
            {
                id: 'secret-leak',
                category: 'leak',
                query: 'What is my API key?',
                forbiddenFacts: ['sk-proj-abc123SECRETvalue'],
            },
            {
                id: 'secret-benign',
                category: 'recall',
                query: 'When do I deploy?',
                expectedFacts: ['Friday'],
            },
        ],
    },
    {
        id: 'irrelevant-recall',
        description: 'A topic never discussed should return nothing, not a forced weak match.',
        userId: 'eval-irrelevant',
        transcript: [
            { user: 'I love hiking on weekends in the Rockies.', assistant: 'The Rockies are beautiful for hiking.' },
        ],
        questions: [
            {
                id: 'irrelevant-db',
                category: 'irrelevant',
                query: 'What database do I use in production?',
                // Nothing about databases was ever said. Expected + forbidden empty:
                // this case scores on precision only — a good store recalls nothing
                // relevant, so there is nothing to forbid, and precision stays 1.
            },
        ],
    },
];
