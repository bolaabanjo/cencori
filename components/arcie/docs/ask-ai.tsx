"use client";

import { ArcieAskAISidebar } from "./ask-ai-sidebar";
import { useDocsContext } from "@/components/docs/DocsContext";

/**
 * Bridges the Arcie Ask-AI sidebar to DocsContext so it can be mounted from
 * the (server) Arcie docs layout. Mirrors components/docs/DocsAskAI.tsx.
 */
export function ArcieDocsAskAI() {
  const { isAskAIOpen, setAskAIOpen } = useDocsContext();
  return (
    <ArcieAskAISidebar open={isAskAIOpen} onClose={() => setAskAIOpen(false)} />
  );
}
