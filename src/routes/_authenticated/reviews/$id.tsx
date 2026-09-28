import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { COMPETENCIES, SCORE_LABELS, formatScore } from "@/lib/hr";
import { useMe } from "@/lib/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reviews/$id")({
  head: () => ({
    meta: [
      { title: "Értékelés – TeljesítményTér" },
      { name: "description", content: "Kompetenciák pontozása 1–5 skálán, szöveges összegzés és beadás." },
      { property: "og:title", content: "Értékelés – TeljesítményTér" },
      { property: "og:description", content: "Kompetenciák pontozása és beadás." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewDetail,
});

type ScoreMap = Record<string, { score: number | null; comment: string }>;

const EMPTY: ScoreMap = Object.fromEntries(
  COMPETENCIES.map((c) => [c.label, { score: null, comment: "" }]),
);

function ReviewDetail() {
  const { id } = Route.useParams();
  const { user, isHr } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<ScoreMap>(EMPTY);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const review = useQuery({
    queryKey: ["review", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "*, review_cycles(name, status), employee:profiles_directory!reviews_employee_id_fkey(full_name, job_title, department), reviewer:profiles_directory!reviews_reviewer_id_fkey(full_name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const existingScores = useQuery({
    queryKey: ["review-scores", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_scores")
        .select("competency, score, comment")
        .eq("review_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (review.data) setSummary(review.data.summary ?? "");
  }, [review.data]);

  useEffect(() => {
    if (!existingScores.data) return;
    const next: ScoreMap = { ...EMPTY };
    for (const row of existingScores.data) {
      next[row.competency] = { score: row.score, comment: row.comment ?? "" };
    }
    setScores(next);
  }, [existingScores.data]);

  const data = review.data;
  const editable = !!data && data.status === "draft" && (data.reviewer_id === user?.id || isHr);

  const filled = COMPETENCIES.map((c) => scores[c.label]?.score).filter(
    (value): value is number => typeof value === "number",
  );
  const average = filled.length ? filled.reduce((sum, v) => sum + v, 0) / filled.length : null;

  async function persist(status: "draft" | "submitted") {
    if (!data) return;
    if (status === "submitted" && filled.length < COMPETENCIES.length) {
      toast.error("Beadás előtt minden kompetenciát pontozz.");
      return;
    }
    setSaving(true);
    try {
      const rows = COMPETENCIES.filter((c) => typeof scores[c.label]?.score === "number").map((c) => ({
        review_id: data.id,
        competency: c.label,
        score: scores[c.label]!.score as number,
        comment: scores[c.label]!.comment || null,
      }));

      if (rows.length) {
        const { error } = await supabase.from("review_scores").upsert(rows, { onConflict: "review_id,competency" });
        if (error) throw error;
      }

      const { error: reviewError } = await supabase
        .from("reviews")
        .update({
          summary: summary || null,
          overall_score: average,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .eq("id", data.id);
      if (reviewError) throw reviewError;

      await queryClient.invalidateQueries();
      toast.success(status === "submitted" ? "Az értékelés beadva." : "Vázlat mentve.");
      if (status === "submitted") navigate({ to: "/reviews" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A mentés nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  if (review.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data)
    return (
      <div className="panel p-8 text-center">
        <p className="text-sm text-muted-foreground">Ez az értékelés nem található, vagy nincs hozzá jogosultságod.</p>
        <Button className="mt-4" asChild>
          <Link to="/reviews">Vissza a listához</Link>
        </Button>
      </div>
    );

  const employee = data.employee as
    | { full_name: string; job_title: string | null; department: string | null }
    | null;

  return (
    <div className="space-y-8">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{(data.review_cycles as { name: string } | null)?.name}</p>
            <h1 className="mt-2 text-3xl font-semibold">{employee?.full_name || "Munkatárs"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[employee?.job_title, employee?.department].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="text-right">
            <Badge variant={data.status === "submitted" ? "default" : "secondary"}>
              {data.status === "submitted" ? "Beadva" : "Vázlat"}
            </Badge>
            <p className="mt-3 eyebrow">Összpontszám</p>
            <p className="font-display text-3xl font-semibold">{formatScore(average ?? data.overall_score)}</p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        {COMPETENCIES.map((competency) => {
          const current = scores[competency.label] ?? { score: null, comment: "" };
          return (
            <article key={competency.key} className="panel p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{competency.label}</h2>
                  <p className="text-sm text-muted-foreground">{competency.hint}</p>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!editable}
                      title={SCORE_LABELS[value]}
                      onClick={() =>
                        setScores((prev) => ({
                          ...prev,
                          [competency.label]: { ...current, score: value },
                        }))
                      }
                      className={cn(
                        "size-10 rounded-lg border font-display text-sm transition-colors",
                        current.score === value
                          ? "surface-copper border-transparent font-semibold"
                          : "bg-secondary text-secondary-foreground hover:bg-muted",
                        !editable && "cursor-not-allowed opacity-70",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {current.score ? SCORE_LABELS[current.score] : "Még nincs pontozva"}
              </p>

              <div className="mt-4 space-y-2">
                <Label htmlFor={`comment-${competency.key}`}>Megjegyzés</Label>
                <Textarea
                  id={`comment-${competency.key}`}
                  value={current.comment}
                  disabled={!editable}
                  rows={2}
                  placeholder="Konkrét példa, fejlesztési javaslat…"
                  onChange={(event) =>
                    setScores((prev) => ({
                      ...prev,
                      [competency.label]: { ...current, comment: event.target.value },
                    }))
                  }
                />
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel p-6">
        <Label htmlFor="summary" className="text-base font-semibold">
          Összegzés
        </Label>
        <Textarea
          id="summary"
          className="mt-3"
          rows={5}
          value={summary}
          disabled={!editable}
          placeholder="Fő eredmények, fejlesztési célok a következő negyedévre…"
          onChange={(event) => setSummary(event.target.value)}
        />
      </section>

      {editable ? (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => persist("draft")} disabled={saving}>
            Vázlat mentése
          </Button>
          <Button onClick={() => persist("submitted")} disabled={saving}>
            Beadás
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.status === "submitted"
            ? "Ez az értékelés be van adva, ezért már nem módosítható."
            : "Ezt az értékelést csak az értékelő vezető szerkesztheti."}
        </p>
      )}
    </div>
  );
}
