import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { Search, Plus, ChevronDown } from "lucide-react";
import { Button } from "./button";

interface OrganizationDropdownProps {
  currentOrgSlug?: string;
}

export const OrganizationDropdown: React.FC<OrganizationDropdownProps> = ({ currentOrgSlug }) => {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchOrganizations = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name, slug");

      if (fetchError) {
        console.error("Error fetching organizations:", fetchError.message);
        setError("Failed to load organizations.");
      } else {
        setOrganizations(data || []);
      }
      setLoading(false);
    };
    fetchOrganizations();
  }, []);

  const filteredOrganizations = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="px-2">
          Organizations <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-58">
        <DropdownMenuLabel>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/organizations")}>
          All Organizations
        </DropdownMenuItem>
        {loading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled className="text-red-500">{error}</DropdownMenuItem>
        ) : filteredOrganizations.length > 0 ? (
          filteredOrganizations.map((org) => (
            <DropdownMenuItem key={org.id} onClick={() => router.push(`/dashboard/organizations/${org.slug}/projects`)}>
              {org.name}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No organizations found.</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/organizations/new")}>
          <Plus className="mr-2 h-4 w-4" /> Create New Organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface ProjectDropdownProps {
  orgSlug: string;
  currentProjectSlug?: string;
}

export const ProjectDropdown: React.FC<ProjectDropdownProps> = ({
  orgSlug,
  currentProjectSlug,
}) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      setError(null);
      const { data: organization, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", orgSlug)
        .single();

      if (orgError || !organization) {
        console.error("Error fetching organization for project dropdown:", orgError?.message);
        setError("Organization not found.");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("projects")
        .select("id, name, slug")
        .eq("organization_id", organization.id);

      if (fetchError) {
        console.error("Error fetching projects:", fetchError.message);
        setError("Failed to load projects.");
      } else {
        setProjects(data || []);
      }
      setLoading(false);
    };
    fetchProjects();
  }, [orgSlug]);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="px-2">
          Projects <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/dashboard/organizations/${orgSlug}/projects`)}>
          All Projects
        </DropdownMenuItem>
        {loading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled className="text-red-500">{error}</DropdownMenuItem>
        ) : filteredProjects.length > 0 ? (
          filteredProjects.map((project) => (
            <DropdownMenuItem key={project.id} onClick={() => router.push(`/dashboard/organizations/${orgSlug}/projects/${project.slug}`)}>
              {project.name}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No projects found.</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/dashboard/organizations/${orgSlug}/projects/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Create New Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
