"use client";

import { createContext, useContext, useState } from "react";

// Shared client state for the Arcie docs chrome: the sidebar filter query and
// the mobile drawer open/closed flag. Lets the header search box and the
// sidebar nav stay in sync without prop-drilling.
type ArcieDocsState = {
  query: string;
  setQuery: (q: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const ArcieDocsContext = createContext<ArcieDocsState | null>(null);

export function ArcieDocsProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ArcieDocsContext.Provider
      value={{ query, setQuery, mobileOpen, setMobileOpen }}
    >
      {children}
    </ArcieDocsContext.Provider>
  );
}

export function useArcieDocs() {
  const ctx = useContext(ArcieDocsContext);
  if (!ctx) {
    throw new Error("useArcieDocs must be used within a ArcieDocsProvider");
  }
  return ctx;
}
