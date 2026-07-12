import Navbar from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

export default function ProductsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <Navbar homeUrl="/" />
            {children}
            <Footer />
        </div>
    );
}
