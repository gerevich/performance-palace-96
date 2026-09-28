import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatScore } from "@/lib/hr";
import { useMe } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/reviews/")({
  head: () => ({
    meta: [
      { title: "Értékelések – TeljesítményTér" },
      { name: "description", content: "Negyedéves értékelések listája, új értékelés indítása a csapattagokhoz." },
      { property: "og:title", content: "Értékelések – TeljesítményTér" },
      { property: "og:description", content: "Negyedéves értékelések kezelése." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const { user, isHr } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cycleId, setCycleId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [creating, setCreating] = useState(false);

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

  const candidates = useQuery({
    queryKey: ["candidates", user?.id, isHr],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from("profiles_directory").select("id, full_name, job_title").order("full_name");
      if (!isHr) query = query.eq("manager_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((p) => p.id !== user!.id);
    },
  });

  const reviews = useQuery({
    queryKey: ["reviews-list", user?.id, isHr],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("reviews")
        .select(
          "id, status, overall_score, updated_at, review_cycles(name), employee:profiles_directory!reviews_employee_id_fkey(full_name, department), reviewer:profiles_directory!reviews_reviewer_id_fkey(full_name)",
        )
        .order("updated_at", { ascending: false });
      if (!isHr) query = query.eq("reviewer_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const openCycles = (cycles.data ?? []).filter((c) => c.status === "open");

  async function createReview() {
    if (!cycleId || !employeeId || !user) {
      toast.error("Válassz ciklust és munkatársat.");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("reviews")
      .insert({ cycle_id: cycleId, employee_id: employeeId, reviewer_id: user.id })
      .select("id")
      .single();
    setCreating(false);

    if (error) {
      toast.error(
        error.code === "23505" || error.message.includes("duplicate")
          ? "Ehhez a munkatárshoz ebben a ciklusban már van értékelésed."
          : error.message,
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["reviews-list"] });
    navigate({ to: "/reviews/$id", params: { id: data.id } });
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Negyedéves ciklusok</p>
        <h1 className="mt-2 text-3xl font-semibold">Értékelések</h1>
      </header>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">Új értékelés indítása</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={cycleId} onValueChange={setCycleId}>
            <SelectTrigger>
              <SelectValue placeholder="Ciklus" />
            </SelectTrigger>
            <SelectContent>
              {openCycles.map((cycle) => (
                <SelectItem key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Munkatárs" />
            </SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id!}>
                  {person.full_name || "Munkatárs"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={createReview} disabled={creating}>
            Létrehozás
          </Button>
        </div>
        {!candidates.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nincs értékelhető munkatárs. A HR oldalon kell beállítani, kinek vagy a vezetője.
          </p>
        ) : null}
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">{isHr ? "Minden értékelés" : "Saját értékeléseim"}</h2>
        {reviews.isLoading ? (
          <Skeleton className="mt-4 h-32 w-full" />
        ) : reviews.data?.length ? (
          <ul className="mt-4 divide-y">
            {reviews.data.map((review) => {
              const employee = review.employee as { full_name: string; department: string | null } | null;
              const reviewer = review.reviewer as { full_name: string } | null;
              return (
                <li key={review.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="font-medium">{employee?.full_name || "Munkatárs"}</p>
                    <p className="text-xs text-muted-foreground">
                      {(review.review_cycles as { name: string } | null)?.name}
                      {employee?.department ? ` · ${employee.department}` : ""}
                      {isHr && reviewer?.full_name ? ` · értékelő: ${reviewer.full_name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={review.status === "submitted" ? "default" : "secondary"}>
                      {review.status === "submitted" ? "Beadva" : "Vázlat"}
                    </Badge>
                    <span className="font-display text-sm">{formatScore(review.overall_score)}</span>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/reviews/$id" params={{ id: review.id }}>
                        Megnyitás
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Még nincs értékelés.</p>
        )}
      </section>
    </div>
  );
}
