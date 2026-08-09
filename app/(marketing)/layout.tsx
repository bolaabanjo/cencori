import Navbar from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="marketing-theme min-h-screen bg-background text-foreground [--border:#b8b8b8] dark:[--border:#4a4a4a]">
            <Navbar homeUrl="/" />
            {children}
            <Footer />
        </div>
    );
}
