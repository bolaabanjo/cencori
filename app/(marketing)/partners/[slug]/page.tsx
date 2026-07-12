"use client";

import { useParams, notFound } from "next/navigation";
import { partners } from "@/config/partners";
import { PartnerTemplate } from "@/components/partners/PartnerTemplate";

export default function PartnerPage() {
    const params = useParams();
    const slug = params.slug as string;
    const config = partners[slug];

    if (!config) {
        notFound();
    }

    return <PartnerTemplate config={config} />;
}
