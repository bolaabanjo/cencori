import { Metadata } from "next";
import { AuthNavbar } from "@/components/landing/AuthNavbar";
import { Footer } from "@/components/landing/Footer";
import { buildOgImageUrl } from "@/lib/og";

const academyOgImage = buildOgImageUrl({
    title: "Cencori Academy",
    subtitle: "Interactive tutorials for AI production",
    type: "docs",
});

export const metadata: Metadata = {
    title: "Academy | Cencori",
    description: "Learn to build production AI applications with Cencori through interactive tutorials.",
    openGraph: {
        title: "Cencori Academy",
        description: "Interactive tutorials for building production AI applications",
        images: [academyOgImage],
    },
};

export default function AcademyLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <AuthNavbar />
            {children}
            <Footer />
        </div>
    );
}
