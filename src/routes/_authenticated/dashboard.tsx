import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatScore } from "@/lib/hr";
import { useMe } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Áttekintés – TeljesítményTér" },
      { name: "description", content: "Nyitott értékelési ciklusok, a csapatod és a saját értékeléseid egy helyen." },
      { property: "og:title", content: "Áttekintés – TeljesítményTér" },
      { property: "og:description", content: "Nyitott ciklusok, csapat és értékelések áttekintése." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { user, profile, isHr } = useMe();

  const cycles = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_cycles")
        .select("*")
        .order("year", { ascending: false })
        .order("quarter", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const team = useQuery({
    queryKey: ["team", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, department")
        .eq("manager_id", user!.id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const myReviews = useQuery({
    queryKey: ["my-reviews", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, status, overall_score, cycle_id, employee_id, review_cycles(name), profiles!reviews_employee_id_fkey(full_name)")
        .eq("reviewer_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const aboutMe = useQuery({
    queryKey: ["reviews-about-me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, overall_score, summary, review_cycles(name)")
        .eq("employee_id", user!.id)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openCycles = (cycles.data ?? []).filter((c) => c.status === "open");
  const drafts = (myReviews.data ?? []).filter((r) => r.status === "draft").length;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Áttekintés</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Üdv{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
          </h1>
        </div>
        <Button asChild>
          <Link to="/reviews">Értékelések kezelése</Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nyitott ciklus" value={String(openCycles.length)} hint={openCycles.map((c) => c.name).join(", ") || "—"} />
        <Stat label="Csapattagok" value={String(team.data?.length ?? 0)} hint="Közvetlen beosztottak" />
        <Stat label="Vázlat értékelés" value={String(drafts)} hint="Még nincs beadva" />
        <Stat label="Rólam beadott" value={String(aboutMe.data?.length ?? 0)} hint="Lezárt értékelések" />
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">A csapatom</h2>
          {team.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : team.data?.length ? (
            <ul className="mt-4 divide-y">
              {team.data.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{member.full_name || member.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {[member.job_title, member.department].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Még nincs hozzád rendelt munkatárs.{" "}
              {isHr ? "A HR oldalon tudsz vezetőt állítani a munkatársakhoz." : "Kérd meg a HR-t, hogy állítsa be."}
            </p>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Legutóbbi értékeléseim</h2>
          {myReviews.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : myReviews.data?.length ? (
            <ul className="mt-4 divide-y">
              {myReviews.data.map((review) => (
                <li key={review.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {(review.profiles as { full_name: string } | null)?.full_name || "Munkatárs"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(review.review_cycles as { name: string } | null)?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={review.status === "submitted" ? "default" : "secondary"}>
                      {review.status === "submitted" ? "Beadva" : "Vázlat"}
                    </Badge>
                    <span className="font-display text-sm">{formatScore(review.overall_score)}</span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/reviews/$id" params={{ id: review.id }}>
                        Megnyitás
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Még nem készítettél értékelést.</p>
          )}
        </div>
      </section>

      {aboutMe.data?.length ? (
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Rólam készült értékelések</h2>
          <ul className="mt-4 space-y-4">
            {aboutMe.data.map((review) => (
              <li key={review.id} className="rounded-lg bg-secondary p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{(review.review_cycles as { name: string } | null)?.name}</p>
                  <span className="font-display">{formatScore(review.overall_score)}</span>
                </div>
                {review.summary ? (
                  <p className="mt-2 text-sm text-muted-foreground">{review.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
