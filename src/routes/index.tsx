import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ClipboardCheck, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TeljesítményTér – negyedéves teljesítményértékelés" },
      {
        name: "description",
        content:
          "Negyedéves teljesítményértékelő rendszer vezetőknek és HR-nek: pontozás kompetenciák szerint, áttekintő riportok, egy helyen.",
      },
      { property: "og:title", content: "TeljesítményTér – negyedéves teljesítményértékelés" },
      {
        property: "og:description",
        content:
          "Vezetői értékelés pontozással és HR-riportokkal, negyedéves ciklusokban.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: "Vezetői értékelés",
    text: "Öt kompetencia, 1–5 pontozás, szöveges összegzés. A vázlat addig szerkeszthető, amíg be nem adják.",
  },
  {
    icon: BarChart3,
    title: "HR-riportok",
    text: "Negyedéves készültség, átlagpontok szervezeti egységenként, egy kattintással exportálható táblázat.",
  },
  {
    icon: Users,
    title: "Szervezeti felépítés",
    text: "Munkatársak, pozíciók és közvetlen vezetők nyilvántartása, jogosultságokkal.",
  },
  {
    icon: ShieldCheck,
    title: "Védett adatok",
    text: "Mindenki csak azt látja, amihez joga van: a vezető a csapatát, a munkatárs a saját beadott értékelését.",
  },
];

function Landing() {
  const { session } = useSession();

  return (
    <div className="min-h-screen">
      <section className="surface-ink">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <p className="eyebrow text-accent">Negyedéves értékelési ciklusok</p>
          <h1 className="mt-5 text-4xl font-semibold sm:text-6xl">
            Teljesítményértékelés,<br className="hidden sm:block" /> felesleges körök nélkül
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-sidebar-foreground/80">
            A vezetők negyedévente pontozzák a csapatukat, a HR pedig valós időben látja, hol tart a folyamat és
            hogyan alakulnak az eredmények.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="secondary" asChild>
              <Link to={session ? "/dashboard" : "/auth"}>
                {session ? "Tovább az áttekintéshez" : "Belépés / regisztráció"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="panel p-6">
              <f.icon className="size-6 text-accent" />
              <h2 className="mt-4 text-xl font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        TeljesítményTér · belső HR-eszköz
      </footer>
    </div>
  );
}
