import Link from "next/link";

interface Course {
    id: string;
    title: string;
    description: string;
    href: string;
    comingSoon?: boolean;
}

const courses: Course[] = [
    {
        id: "getting-started",
        title: "Getting Started with Cencori",
        description: "Learn the fundamentals: set up your account, make your first AI request, and explore the dashboard.",
        href: "/academy/getting-started",
    },
    {
        id: "security-deep-dive",
        title: "Security Deep Dive",
        description: "Master Cencori's security features: PII detection, jailbreak protection, and custom security rules.",
        href: "/academy/security-deep-dive",
        comingSoon: true,
    },
    {
        id: "sdk-mastery",
        title: "SDK Mastery",
        description: "Advanced SDK usage: streaming, error handling, Vercel AI SDK integration, and best practices.",
        href: "/academy/sdk-mastery",
        comingSoon: true,
    },
    {
        id: "multi-provider-routing",
        title: "Multi-Provider Routing",
        description: "Configure failover chains, model mappings, and automatic provider switching for maximum uptime.",
        href: "/academy/multi-provider-routing",
        comingSoon: true,
    },
    {
        id: "building-ai-agents",
        title: "Building AI Agents",
        description: "Build autonomous AI agents with tool use, memory, and human-in-the-loop approval workflows.",
        href: "/academy/building-ai-agents",
        comingSoon: true,
    },
    {
        id: "rag-and-memory",
        title: "RAG and Memory",
        description: "Implement retrieval-augmented generation with vector search, document ingestion, and context management.",
        href: "/academy/rag-and-memory",
        comingSoon: true,
    },
];

const frameworkCourses: Course[] = [
    {
        id: "nextjs-ai-app",
        title: "AI Apps with Next.js",
        description: "Build a full-stack AI application with Next.js App Router, server actions, and Cencori's streaming API.",
        href: "/academy/nextjs-ai-app",
        comingSoon: true,
    },
    {
        id: "supabase-rag",
        title: "Supabase + Cencori RAG",
        description: "Build a knowledge base with Supabase pgvector, row-level security, and Cencori's retrieval-augmented generation.",
        href: "/academy/supabase-rag",
        comingSoon: true,
    },
    {
        id: "python-ai-backend",
        title: "Python AI Backend",
        description: "Build AI-powered APIs with FastAPI and the Cencori Python SDK. Streaming, structured output, and async patterns.",
        href: "/academy/python-ai-backend",
        comingSoon: true,
    },
    {
        id: "langchain-integration",
        title: "LangChain with Cencori",
        description: "Use Cencori as the LLM provider in LangChain pipelines. Chains, agents, tools, and output parsers.",
        href: "/academy/langchain-integration",
        comingSoon: true,
    },
    {
        id: "flutter-ai-chat",
        title: "Flutter AI Chat App",
        description: "Build a cross-platform AI chat app with Flutter and Cencori. Real-time streaming, offline support, and native UI.",
        href: "/academy/flutter-ai-chat",
        comingSoon: true,
    },
    {
        id: "astro-ai-site",
        title: "AI-Powered Sites with Astro",
        description: "Add AI features to static and hybrid Astro sites. Content generation, search, and on-demand personalization.",
        href: "/academy/astro-ai-site",
        comingSoon: true,
    },
    {
        id: "vercel-ai-sdk",
        title: "Vercel AI SDK + Cencori",
        description: "Use Cencori as a provider with the Vercel AI SDK. useChat, useCompletion, streaming UI, and generative interfaces.",
        href: "/academy/vercel-ai-sdk",
        comingSoon: true,
    },
    {
        id: "react-native-ai",
        title: "React Native AI Features",
        description: "Add AI capabilities to React Native apps. Voice input, chat interfaces, and on-device prompt management.",
        href: "/academy/react-native-ai",
        comingSoon: true,
    },
    {
        id: "django-ai-backend",
        title: "Django + Cencori",
        description: "Integrate Cencori into Django applications. Views, middleware, background tasks, and admin panel extensions.",
        href: "/academy/django-ai-backend",
        comingSoon: true,
    },
    {
        id: "go-ai-services",
        title: "Go AI Microservices",
        description: "Build high-performance AI microservices in Go with the Cencori Go SDK. Concurrency, streaming, and gRPC patterns.",
        href: "/academy/go-ai-services",
        comingSoon: true,
    },
];

function CourseRow({ course }: { course: Course }) {
    const inner = (
        <div className={`px-0 md:px-8 py-8 border-b border-border/40 ${course.comingSoon ? "opacity-50" : "group"}`}>
            <h3 className="text-lg font-semibold tracking-tight group-hover:text-primary transition-colors">
                {course.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">
                {course.description}
            </p>
        </div>
    );

    if (course.comingSoon) {
        return <div>{inner}</div>;
    }

    return (
        <Link href={course.href} className="block">
            {inner}
        </Link>
    );
}

export default function AcademyPage() {
    return (
        <>
            <main className="flex-1 container mx-auto px-4 md:px-6 py-8 md:py-12">
                <div className="max-w-5xl mx-auto">
                    {/* Hero */}
                    <div className="border-b border-border/40">
                        <div className="py-24 sm:py-32 text-center">
                            <img
                                src="/logo white.svg"
                                alt="Cencori"
                                className="h-8 w-auto mx-auto mb-8 hidden dark:block"
                            />
                            <img
                                src="/logo black.svg"
                                alt="Cencori"
                                className="h-8 w-auto mx-auto mb-8 block dark:hidden"
                            />
                            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
                                Cencori Academy
                            </h1>
                            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                                Go from beginner to expert by learning how to build
                                production-grade AI applications with Cencori&apos;s
                                unified infrastructure.
                            </p>
                        </div>
                    </div>

                    {/* Courses */}
                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] border-b border-border/40">
                        <div className="pt-10 pb-4 md:py-10 md:border-r border-border/40">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                                Courses
                            </h2>
                        </div>
                        <div>
                            {courses.map((course) => (
                                <CourseRow key={course.id} course={course} />
                            ))}
                        </div>
                    </div>

                    {/* Frameworks & Tools */}
                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
                        <div className="pt-10 pb-4 md:py-10 md:border-r border-border/40">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                                Frameworks & Tools
                            </h2>
                        </div>
                        <div>
                            {frameworkCourses.map((course) => (
                                <CourseRow key={course.id} course={course} />
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}
