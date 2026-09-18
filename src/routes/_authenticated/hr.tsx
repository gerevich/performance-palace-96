import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, formatScore } from "@/lib/hr";
import { useMe } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "HR-áttekintés – TeljesítményTér" },
      {
        name: "description",
        content: "Negyedéves készültség, átlagpontok, munkatársak és jogosultságok kezelése egy felületen.",
      },
      { property: "og:title", content: "HR-áttekintés – TeljesítményTér" },
      { property: "og:description", content: "Riportok, munkatársak és ciklusok kezelése." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HrPage,
});

function HrPage() {
  const { isHr, loading } = useMe();
  const queryClient = useQueryClient();
  const [newCycle, setNewCycle] = useState({ year: String(new Date().getFullYear()), quarter: "1" });

  const profiles = useQuery({
    queryKey: ["hr-profiles"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, department, manager_id")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const roles = useQuery({
    queryKey: ["hr-roles"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const reviews = useQuery({
    queryKey: ["hr-reviews"],
    enabled: isHr,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id, status, overall_score, cycle_id, employee:profiles!reviews_employee_id_fkey(full_name, email, department), reviewer:profiles!reviews_reviewer_id_fkey(full_name)",
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!isHr)
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-xl font-semibold">Nincs hozzáférésed</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ez a felület HR-adminisztrátoroknak szól.</p>
      </div>
    );

  const roleByUser = new Map<string, string[]>();
  for (const row of roles.data ?? []) {
    roleByUser.set(row.user_id, [...(roleByUser.get(row.user_id) ?? []), row.role as string]);
  }

  async function updateProfile(
    id: string,
    patch: { job_title?: string | null; department?: string | null; manager_id?: string | null },
  ) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["hr-profiles"] });
    toast.success("Mentve.");
  }

  async function setRole(userId: string, role: string) {
    const { error: deleteError } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as never });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["hr-roles"] });
    toast.success("Jogosultság módosítva.");
  }

  async function createCycle() {
    const year = Number(newCycle.year);
    const quarter = Number(newCycle.quarter);
    const startMonth = (quarter - 1) * 3 + 1;
    const starts = new Date(Date.UTC(year, startMonth - 1, 1));
    const ends = new Date(Date.UTC(year, startMonth + 2, 0));
    const { error } = await supabase.from("review_cycles").insert({
      name: `${year} Q${quarter}`,
      year,
      quarter,
      starts_on: starts.toISOString().slice(0, 10),
      ends_on: ends.toISOString().slice(0, 10),
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ez a negyedév már létezik." : error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["cycles"] });
    toast.success("Ciklus létrehozva.");
  }

  async function toggleCycle(id: string, status: string) {
    const { error } = await supabase
      .from("review_cycles")
      .update({ status: (status === "open" ? "closed" : "open") as never })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["cycles"] });
  }

  function exportCsv() {
    const rows = [["Ciklus", "Munkatárs", "Szervezeti egység", "Értékelő", "Állapot", "Összpontszám"]];
    const cycleName = new Map((cycles.data ?? []).map((c) => [c.id, c.name]));
    for (const review of reviews.data ?? []) {
      const employee = review.employee as { full_name: string; email: string; department: string | null } | null;
      const reviewer = review.reviewer as { full_name: string } | null;
      rows.push([
        cycleName.get(review.cycle_id) ?? "",
        employee?.full_name || employee?.email || "",
        employee?.department ?? "",
        reviewer?.full_name ?? "",
        review.status === "submitted" ? "Beadva" : "Vázlat",
        review.overall_score === null ? "" : String(review.overall_score),
      ]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ertekelesek.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const allReviews = reviews.data ?? [];
  const employeeCount = profiles.data?.length ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">HR</p>
          <h1 className="mt-2 text-3xl font-semibold">Áttekintés és beállítások</h1>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          Táblázat letöltése (CSV)
        </Button>
      </header>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Riportok</TabsTrigger>
          <TabsTrigger value="people">Munkatársak</TabsTrigger>
          <TabsTrigger value="cycles">Ciklusok</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5">
              <p className="eyebrow">Munkatársak</p>
              <p className="mt-2 font-display text-3xl font-semibold">{employeeCount}</p>
            </div>
            <div className="panel p-5">
              <p className="eyebrow">Beadott értékelés</p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {allReviews.filter((r) => r.status === "submitted").length}
              </p>
            </div>
            <div className="panel p-5">
              <p className="eyebrow">Vállalati átlag</p>
              <p className="mt-2 font-display text-3xl font-semibold">
                {(() => {
                  const values = allReviews
                    .filter((r) => r.status === "submitted" && r.overall_score !== null)
                    .map((r) => Number(r.overall_score));
                  return values.length ? formatScore(values.reduce((a, b) => a + b, 0) / values.length) : "–";
                })()}
              </p>
            </div>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Negyedéves készültség</h2>
            <div className="mt-4 space-y-4">
              {(cycles.data ?? []).map((cycle) => {
                const inCycle = allReviews.filter((r) => r.cycle_id === cycle.id);
                const submitted = inCycle.filter((r) => r.status === "submitted");
                const scores = submitted.map((r) => Number(r.overall_score)).filter((v) => !Number.isNaN(v));
                const ratio = employeeCount ? Math.round((submitted.length / employeeCount) * 100) : 0;
                return (
                  <div key={cycle.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {cycle.name}{" "}
                        <Badge variant={cycle.status === "open" ? "default" : "secondary"} className="ml-2">
                          {cycle.status === "open" ? "Nyitott" : "Zárt"}
                        </Badge>
                      </span>
                      <span className="text-muted-foreground">
                        {submitted.length}/{employeeCount} beadva · átlag{" "}
                        {scores.length ? formatScore(scores.reduce((a, b) => a + b, 0) / scores.length) : "–"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full surface-copper" style={{ width: `${Math.min(ratio, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Átlag szervezeti egységenként</h2>
            <div className="mt-4 space-y-3 text-sm">
              {(() => {
                const byDepartment = new Map<string, number[]>();
                for (const review of allReviews) {
                  if (review.status !== "submitted" || review.overall_score === null) continue;
                  const department =
                    (review.employee as { department: string | null } | null)?.department || "Nincs megadva";
                  byDepartment.set(department, [...(byDepartment.get(department) ?? []), Number(review.overall_score)]);
                }
                if (!byDepartment.size)
                  return <p className="text-muted-foreground">Még nincs beadott értékelés.</p>;
                return [...byDepartment.entries()].map(([department, values]) => (
                  <div key={department} className="flex items-center justify-between border-b pb-2">
                    <span>{department}</span>
                    <span className="font-display">
                      {formatScore(values.reduce((a, b) => a + b, 0) / values.length)}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="people" className="mt-6">
          <div className="panel overflow-x-auto p-6">
            <h2 className="text-lg font-semibold">Munkatársak, vezetők, jogosultságok</h2>
            <table className="mt-4 w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3">Név</th>
                  <th className="pb-3">Pozíció</th>
                  <th className="pb-3">Szervezeti egység</th>
                  <th className="pb-3">Vezető</th>
                  <th className="pb-3">Jogosultság</th>
                </tr>
              </thead>
              <tbody>
                {(profiles.data ?? []).map((person) => (
                  <tr key={person.id} className="border-t">
                    <td className="py-3">
                      <p className="font-medium">{person.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{person.email}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        defaultValue={person.job_title ?? ""}
                        placeholder="Pozíció"
                        onBlur={(e) =>
                          e.target.value !== (person.job_title ?? "") &&
                          updateProfile(person.id, { job_title: e.target.value || null })
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        defaultValue={person.department ?? ""}
                        placeholder="Egység"
                        onBlur={(e) =>
                          e.target.value !== (person.department ?? "") &&
                          updateProfile(person.id, { department: e.target.value || null })
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        value={person.manager_id ?? "none"}
                        onValueChange={(value) =>
                          updateProfile(person.id, { manager_id: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="min-w-[160px]">
                          <SelectValue placeholder="Nincs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nincs</SelectItem>
                          {(profiles.data ?? [])
                            .filter((candidate) => candidate.id !== person.id)
                            .map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {candidate.full_name || candidate.email}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-3">
                      <Select
                        value={roleByUser.get(person.id)?.[0] ?? "employee"}
                        onValueChange={(value) => setRole(person.id, value)}
                      >
                        <SelectTrigger className="min-w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cycles" className="mt-6 space-y-6">
          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Új negyedéves ciklus</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="year">Év</Label>
                <Input
                  id="year"
                  value={newCycle.year}
                  onChange={(e) => setNewCycle({ ...newCycle, year: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Negyedév</Label>
                <Select
                  value={newCycle.quarter}
                  onValueChange={(value) => setNewCycle({ ...newCycle, quarter: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "4"].map((quarter) => (
                      <SelectItem key={quarter} value={quarter}>
                        Q{quarter}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="self-end" onClick={createCycle}>
                Létrehozás
              </Button>
            </div>
          </div>

          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Ciklusok</h2>
            <ul className="mt-4 divide-y">
              {(cycles.data ?? []).map((cycle) => (
                <li key={cycle.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{cycle.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cycle.starts_on} – {cycle.ends_on}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={cycle.status === "open" ? "default" : "secondary"}>
                      {cycle.status === "open" ? "Nyitott" : "Zárt"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => toggleCycle(cycle.id, cycle.status)}>
                      {cycle.status === "open" ? "Zárás" : "Újranyitás"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
