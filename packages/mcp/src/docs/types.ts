export interface DocSearchResult {
    title: string;
    description: string;
    section: string;
    href: string;
    snippet: string;
    score: number;
}

export interface DocSearchResponse {
    results: DocSearchResult[];
    error?: string;
}

export interface DocRawResponse {
    content: string;
    error?: string;
}

export interface DocNavItem {
    title: string;
    href: string;
    order: number;
    isSubItem?: boolean;
}

export interface DocNavSection {
    title: string;
    items: DocNavItem[];
    subGroup?: {
        title: string;
        items: DocNavItem[];
    };
}

export interface DocNavigationResponse {
    sections: DocNavSection[];
}
