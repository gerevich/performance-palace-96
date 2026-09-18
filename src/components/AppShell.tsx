import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, ClipboardList, LogOut, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/useAuth";
import { ROLE_LABELS } from "@/lib/hr";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Áttekintés", icon: BarChart3 },
  { to: "/reviews", label: "Értékelések", icon: ClipboardList },
  { to: "/hr", label: "HR", icon: Users, hrOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, isHr } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="surface-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-5">
          <Link to="/dashboard" className="font-display text-lg font-semibold tracking-tight">
            Teljesítmény<span className="text-accent">Tér</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.filter((item) => !("hrOnly" in item && item.hrOnly) || isHr).map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-sidebar-foreground">
                {profile?.full_name || profile?.email || "Munkatárs"}
              </p>
              <p className="text-xs text-sidebar-foreground/65">
                {roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ") || "—"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              Kilépés
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
