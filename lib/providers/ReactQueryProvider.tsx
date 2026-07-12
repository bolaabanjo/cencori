"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        // Data is considered fresh for 5 minutes
                        staleTime: 5 * 60 * 1000,
                        // Cache data for 30 minutes
                        gcTime: 30 * 60 * 1000,
                        // Retry failed requests once
                        retry: 1,
                        // Don't refetch on window focus — prevents full reload on tab-return
                        refetchOnWindowFocus: false,
                        // Don't refetch on mount if data is fresh
                        refetchOnMount: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
