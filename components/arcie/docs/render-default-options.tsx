"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/docs/ui/sidebar";
import { getNavItemIcon } from "./nav-icons";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export interface SidebarOption {
  name: string;
  url: string;
  key: string;
}

export function ArcieRenderDefaultOptions({
  options,
  label,
}: {
  options: SidebarOption[];
  label: string;
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  if (options.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {options.map((item) => {
          const isActive = pathname === item.url;
          return (
            <SidebarMenuItem key={item.url}>
              {isActive && (
                <motion.span
                  layoutId="arcie-sidebar-pill"
                  className="absolute inset-0 rounded-md bg-sidebar-accent"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <SidebarMenuButton
                asChild
                className={cn(
                  "relative z-10 data-[active=true]:bg-transparent",
                  !isActive &&
                    "text-muted-foreground/90 dark:text-muted-foreground/80 hover:text-primary dark:hover:text-primary",
                )}
                isActive={isActive}
              >
                <Link href={item.url} onClick={handleLinkClick}>
                  {getNavItemIcon(item.key)}
                  <span className="capitalize">{item.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
