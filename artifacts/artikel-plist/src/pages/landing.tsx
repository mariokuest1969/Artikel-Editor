import { Link } from "wouter";
import { ShieldCheck, FileDown, Eye, ArrowRight } from "lucide-react";

const points = [
  { icon: Eye, title: "Erst prüfen, dann ersetzen", text: "Jeder Import zeigt Anzahl und Stichprobe der Artikel, bevor die aktive Liste ersetzt wird." },
  { icon: FileDown, title: "Sicherung mit einem Klick", text: "Die aktuelle artikelData.plist lässt sich jederzeit herunterladen, auch vor jeder Änderung." },
  { icon: ShieldCheck, title: "Nur für Freigegebene", text: "Preise und Artikel sieht ausschließlich das hinterlegte Administratorkonto." },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="h-8 w-8" />
            <span className="font-bold tracking-tight">Artikel-Plist</span>
          </div>
          <Link href="/sign-in" data-testid="link-header-sign-in" className="text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground">Anmelden</Link>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-14 md:pt-20">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sidebar-primary">Kassen-Artikelpflege</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Die Artikelliste Ihrer Kasse. Bearbeitet ohne Risiko für Ihre Preise.
          </h1>
          <p className="mt-6 max-w-xl text-base text-sidebar-foreground/70 md:text-lg">
            Artikel, Preise und Warengruppen der artikelData.plist pflegen, mit Dropbox abgleichen und jede Dateiänderung vorher prüfen.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/sign-in" data-testid="link-sign-in" className="inline-flex items-center gap-2 rounded-md bg-sidebar-primary px-5 py-3 text-sm font-medium text-sidebar-primary-foreground hover:opacity-90">
              Anmelden <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sign-up" data-testid="link-sign-up" className="inline-flex items-center rounded-md border border-sidebar-border px-5 py-3 text-sm font-medium hover:bg-sidebar-accent">
              Konto erstellen
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-px overflow-hidden px-6 py-16 md:grid-cols-[1.2fr_1fr_1fr]">
        {points.map((p, i) => (
          <div key={p.title} className={`p-6 ${i === 0 ? "md:pr-10" : "md:border-l"}`}>
            <p.icon className="h-5 w-5 text-primary" />
            <h2 className="mt-4 font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.text}</p>
          </div>
        ))}
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">Artikel-Plist · Zugang nur für freigegebene Administratoren</footer>
    </div>
  );
}
