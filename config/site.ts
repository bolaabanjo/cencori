export const siteConfig = {
  name: "cencori",
  url: "https://cencori.vercel.app", // Replace with your actual site URL
  description:
    "Cencori is a multi-tenant AI infrastructure platform designed to help teams build, deploy, and scale AI-driven applications with consistency and reliability.",
  links: {
    github: "https://github.com/bolaabanjo/cencori", // Replace with your GitHub repository
    docs: "https://cencori.fohnai.com/docs", // Placeholder for documentation
    getStartedUrl: "/signup", // Direct users to signup for getting started
    signInUrl: "/login", // Direct users to login
    x: "https://x.com/cencori",
    products: {
      ai: "/product-ai",
      audit: "/product-audit",
      knight: "/product-knight",
      sandbox: "/product-sandbox",
      insights: "/product-insights",
      network: "/product-network",
      edge: "/product-edge",
      enterprise: "/product-enterprise",
      developerTools: "/product-developer-tools",
    },
    company: {
      about: "/about",
      blog: "/blog",
      careers: "/careers",
      changelog: "/changelog",
      contact: "/contact",
      customers: "/customers",
      events: "/events",
      partners: "/partners",
      shipped: "/shipped",
      privacyPolicy: "/privacy-policy",
    },
  },
};

export type SiteConfig = typeof siteConfig;
