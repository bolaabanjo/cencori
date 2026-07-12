"use client";

import Navbar from "@/components/landing/Navbar";

interface AuthNavbarProps {
    className?: string;
}

export function AuthNavbar({ className }: AuthNavbarProps) {
    return <Navbar homeUrl="/" className={className} />;
}
