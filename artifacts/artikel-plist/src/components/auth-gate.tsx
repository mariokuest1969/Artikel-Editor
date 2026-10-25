import { Redirect } from "wouter";
import { Show, useClerk, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAccess, getGetAccessQueryKey } from "@workspace/api-client-react";
import { ShieldAlert, KeyRound, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function GateShell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-gate-title">{title}</h1>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
        {user?.primaryEmailAddress && (
          <p className="mt-5 text-xs text-muted-foreground">Angemeldet als <span className="font-medium text-foreground">{user.primaryEmailAddress.emailAddress}</span></p>
        )}
        <Button variant="outline" className="mt-6 w-full" data-testid="button-gate-logout"
          onClick={() => { queryClient.clear(); void signOut({ redirectUrl: basePath || "/" }); }}>
          <LogOut className="mr-2 h-4 w-4" /> Abmelden
        </Button>
      </div>
    </div>
  );
}

function AccessCheck({ children }: { children: React.ReactNode }) {
  const access = useGetAccess({ query: { queryKey: getGetAccessQueryKey(), retry: 1, staleTime: 60_000 } });
  if (access.isLoading) {
    return (
      <div className="min-h-[100dvh] flex bg-background">
        <div className="hidden md:block w-64 bg-sidebar" />
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-96" /><Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }
  if (access.isError || !access.data) {
    return (
      <GateShell icon={<RefreshCw className="h-5 w-5" />} title="Zugriff konnte nicht geprüft werden">
        <p>Der Server hat nicht geantwortet. Es werden keine Daten angezeigt, bis die Prüfung erfolgreich war.</p>
        <Button size="sm" onClick={() => access.refetch()} data-testid="button-retry-access">Erneut prüfen</Button>
      </GateShell>
    );
  }
  if (!access.data.configured) {
    return (
      <GateShell icon={<KeyRound className="h-5 w-5" />} title="Administrator noch nicht festgelegt">
        <p>Aus Sicherheitsgründen ist die App gesperrt, bis eine Administrator-E-Mail-Adresse hinterlegt ist.</p>
        <p>Bitte die E-Mail-Adresse des Administrators in den Replit-Einstellungen (Secrets) eintragen und die App neu starten. Danach erhält nur dieses Konto Zugriff auf die Artikeldaten.</p>
      </GateShell>
    );
  }
  if (!access.data.allowed) {
    return (
      <GateShell icon={<ShieldAlert className="h-5 w-5" />} title="Zugriff nicht freigegeben">
        <p>Dieses Konto ist nicht als Administrator freigegeben. Artikel, Preise und Dateien bleiben geschützt.</p>
        <p>Bitte mit dem freigegebenen Konto anmelden oder den Betreiber der Kasse kontaktieren.</p>
      </GateShell>
    );
  }
  return <>{children}</>;
}

export function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in"><AccessCheck>{children}</AccessCheck></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}
