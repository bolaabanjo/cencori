// components/navbar-03/navigation-config.tsx
import {
  Atom,
  Compass,
  Layout,
  Plug,
  Settings,
  Users,
  PlusCircle, // New icon for Create Team
  LogOut, // New icon for Log Out
  DollarSign, // New icon for Upgrade to Pro
  Mail, // New icon for Contact
  Tablet, // New icon for Dashboard
  ChevronRight, // For indicating dropdowns
  UserCog, // For Account Settings
} from "lucide-react";

export const productDropdownItems = [
  {
    title: "Overview",
    href: "/product/overview",
    description: "Understand the core features of our product.",
    icon: Layout,
  },
  {
    title: "Features",
    href: "/product/features",
    description: "Explore detailed functionalities.",
    icon: Atom,
  },
  {
    title: "Integrations",
    href: "/product/integrations",
    description: "Connect with your favorite tools.",
    icon: Plug,
  },
];

export const developersDropdownItems = [
  {
    title: "Documentation",
    href: "/docs",
    description: "Comprehensive guides for developers.",
    icon: Compass,
  },
  {
    title: "API Reference",
    href: "/api-reference",
    description: "Detailed API specifications.",
    icon: Settings,
  },
  {
    title: "Community",
    href: "/community",
    description: "Connect with other developers.",
    icon: Users,
  },
];

export const solutionsDropdownItems = [
  {
    title: "Enterprise",
    href: "/solutions/enterprise",
    description: "Solutions tailored for large organizations.",
    icon: Layout,
  },
  {
    title: "Startups",
    href: "/solutions/startups",
    description: "Accelerate your startup's growth.",
    icon: Atom,
  },
];

// New items for authenticated user's mobile menu
export const authenticatedUserMenuItems = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: Tablet,
  },
  {
    name: "Account Settings",
    href: "/settings/account",
    icon: UserCog,
  },
  {
    name: "Create Team",
    href: "/team/create",
    icon: PlusCircle,
  },
];

// Main navigation items for both desktop and mobile
export const mainNavItems = [
  {
    name: "Product",
    href: "/product",
    type: "dropdown",
    items: productDropdownItems,
  },
  {
    name: "Developers", // Renamed from "Resources" based on common patterns and your config
    href: "/developers",
    type: "dropdown",
    items: developersDropdownItems,
  },
  {
    name: "Solutions",
    href: "/solutions",
    type: "dropdown",
    items: solutionsDropdownItems,
  },
  {
    name: "Pricing",
    href: "/pricing",
    type: "link",
  },
  {
    name: "Docs",
    href: "/docs",
    type: "link",
  },
  {
    name: "Blog",
    href: "/blog",
    type: "link",
  },
];