"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface UserProfile {
    name: string | null;
    avatar: string | null;
    email?: string | null;
}

interface DocsContextType {
    isAskAIOpen: boolean;
    setAskAIOpen: (open: boolean) => void;
    attachedPage: { title: string; slug: string } | null;
    setAttachedPage: (page: { title: string; slug: string } | null) => void;
    userProfile: UserProfile | null;
    setUserProfile: (profile: UserProfile | null) => void;
    scope: "global" | "page";
    setScope: (scope: "global" | "page") => void;
}

const DocsContext = createContext<DocsContextType | undefined>(undefined);

export function DocsProvider({ children }: { children: ReactNode }) {
    const [isAskAIOpen, setAskAIOpen] = useState(false);
    const [attachedPage, setAttachedPage] = useState<{ title: string; slug: string } | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [scope, setScope] = useState<"global" | "page">("global");

    return (
        <DocsContext.Provider value={{ isAskAIOpen, setAskAIOpen, attachedPage, setAttachedPage, userProfile, setUserProfile, scope, setScope }}>
            {children}
        </DocsContext.Provider>
    );
}

export function useDocsContext() {
    const context = useContext(DocsContext);
    if (!context) {
        throw new Error("useDocsContext must be used within a DocsProvider");
    }
    return context;
}
