import { Metadata } from "next";
import { ModelCatalog } from "@/components/models/ModelCatalog";
import { SUPPORTED_PROVIDERS } from "@/lib/providers/config";

export const metadata: Metadata = {
    title: "Models",
    description: "Browse all AI models available through Cencori.",
};

export default function DashboardModelsPage() {
    const totalModels = SUPPORTED_PROVIDERS.reduce((acc, p) => acc + p.models.length, 0);
    const totalProviders = SUPPORTED_PROVIDERS.length;

    return (
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="mb-5 sm:mb-6">
                <h1 className="text-base sm:text-lg font-medium">Models</h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Browse {totalModels}+ models from {totalProviders} providers available through Cencori
                </p>
            </div>

            <ModelCatalog />
        </div>
    );
}
