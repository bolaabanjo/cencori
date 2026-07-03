"use client";

import { createContext, useContext, useState } from "react";

// Shared client state for the Eline docs chrome: the sidebar filter query and
// the mobile drawer open/closed flag. Lets the header search box and the
// sidebar nav stay in sync without prop-drilling.
type ElineDocsState = {
  query: string;
  setQuery: (q: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
};

const ElineDocsContext = createContext<ElineDocsState | null>(null);

export function ElineDocsProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ElineDocsContext.Provider
      value={{ query, setQuery, mobileOpen, setMobileOpen }}
    >
      {children}
    </ElineDocsContext.Provider>
  );
}

export function useElineDocs() {
  const ctx = useContext(ElineDocsContext);
  if (!ctx) {
    throw new Error("useElineDocs must be used within a ElineDocsProvider");
  }
  return ctx;
}
