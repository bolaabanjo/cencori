import type { Session, TurnContext } from "../types.js";

let currentSession: Session | null = null;
let currentTurn: TurnContext | null = null;
const sharedContext = new Map<string, unknown>();

export function getSession(): Session | null {
  return currentSession;
}

export function getTurn(): TurnContext | null {
  return currentTurn;
}

export function setSession(session: Session): void {
  currentSession = session;
}

export function setTurn(turn: TurnContext): void {
  currentTurn = turn;
}

export function getContext<T = unknown>(key: string): T | undefined {
  return sharedContext.get(key) as T | undefined;
}

export function requireContext<T = unknown>(key: string): T {
  const value = sharedContext.get(key);
  if (value === undefined) {
    throw new Error(`Required context key not found: ${key}`);
  }
  return value as T;
}

export function hasContext(key: string): boolean {
  return sharedContext.has(key);
}

export function setContext(key: string, value: unknown): void {
  sharedContext.set(key, value);
}

export function ensureContext<T>(
  key: string,
  factory: () => T
): T {
  if (!sharedContext.has(key)) {
    sharedContext.set(key, factory());
  }
  return sharedContext.get(key) as T;
}
