export const COMPETENCIES = [
  { key: "szakmai", label: "Szakmai teljesítmény", hint: "Munka minősége, eredmények, határidők" },
  { key: "egyuttmukodes", label: "Együttműködés", hint: "Csapatmunka, segítőkészség" },
  { key: "kommunikacio", label: "Kommunikáció", hint: "Világos, időben történő egyeztetés" },
  { key: "onallosag", label: "Önállóság", hint: "Felelősségvállalás, döntéshozatal" },
  { key: "fejlodes", label: "Fejlődés és tanulás", hint: "Visszajelzés beépítése, új készségek" },
] as const;

export const SCORE_LABELS: Record<number, string> = {
  1: "Fejlesztendő",
  2: "Részben megfelelt",
  3: "Megfelelt",
  4: "Jó",
  5: "Kiemelkedő",
};

export function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return "–";
  return Number(value).toFixed(2).replace(".", ",");
}

export function scoreTone(value: number | null | undefined) {
  if (value === null || value === undefined) return "muted" as const;
  if (value >= 4) return "success" as const;
  if (value >= 3) return "accent" as const;
  return "destructive" as const;
}

export const ROLE_LABELS: Record<string, string> = {
  hr_admin: "HR-adminisztrátor",
  manager: "Vezető",
  employee: "Munkatárs",
};
