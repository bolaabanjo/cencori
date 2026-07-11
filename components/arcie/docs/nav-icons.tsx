"use client";

import {
  HouseIcon,
  AddMagicIcon,
  SquareAddonIcon,
  BookIcon,
  ShapesIcon,
  ChartConfigIcon,
} from "@/assets/icons";

type IconComponent = React.FC<{ width?: string | number; height?: string | number; className?: string }>;

const ICON_MAP: Record<string, IconComponent> = {
  // Getting Started (root pages)
  docs: HouseIcon, // index page — /arcie/docs
  introduction: HouseIcon,
  installation: SquareAddonIcon,
  quickstart: AddMagicIcon,
  // Folders
  concepts: ShapesIcon,
  authoring: SquareAddonIcon,
  runtime: ChartConfigIcon,
  reference: BookIcon,
};

export function getNavItemIcon(key: string, className = "size-4 shrink-0") {
  const norm = key.toLowerCase().replace(/\s+/g, "-");
  const Icon = ICON_MAP[norm] ?? BookIcon;
  return <Icon className={className} />;
}
