import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { deDE } from "@clerk/localizations";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ArticlesList from "@/pages/articles-list";
import ArticleForm from "@/pages/article-form";
import SettingsPage from "@/pages/settings";
import Landing from "@/pages/landing";
import { Protected } from "@/components/auth-gate";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(221 83% 53%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215 20% 40%)",
    colorDanger: "hsl(0 72% 48%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(210 30% 98%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(222 30% 40%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-[hsl(214_32%_91%)] shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(222_47%_11%)] font-semibold",
    headerSubtitle: "text-[hsl(215_20%_40%)]",
    socialButtonsBlockButtonText: "text-[hsl(222_47%_11%)]",
    formFieldLabel: "text-[hsl(222_47%_11%)]",
    footerActionLink: "text-[hsl(221_83%_45%)] font-medium",
    footerActionText: "text-[hsl(215_20%_40%)]",
    dividerText: "text-[hsl(215_20%_40%)]",
    identityPreviewEditButton: "text-[hsl(221_83%_45%)]",
    formFieldSuccessText: "text-[hsl(152_60%_30%)]",
    alertText: "text-[hsl(222_47%_11%)]",
    logoBox: "h-10",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-[hsl(214_32%_88%)] bg-white",
    formButtonPrimary: "bg-[hsl(221_83%_53%)] text-white",
    formFieldInput: "border border-[hsl(214_32%_88%)]",
    footerAction: "bg-[hsl(210_30%_97%)]",
    dividerLine: "bg-[hsl(214_32%_88%)]",
    alert: "border border-[hsl(214_32%_88%)]",
    otpCodeFieldInput: "border border-[hsl(214_32%_88%)]",
    formFieldRow: "",
    main: "",
  },
};

function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-sidebar px-4 py-10">
      <p className="text-sm text-sidebar-foreground/70">Artikel-Plist · Kassen-Artikelpflege</p>
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <AuthBackdrop>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthBackdrop>
  );
}

function SignUpPage() {
  return (
    <AuthBackdrop>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthBackdrop>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/artikel" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

const ProtectedList = () => <Protected><ArticlesList /></Protected>;
const ProtectedForm = () => <Protected><ArticleForm /></Protected>;
const ProtectedSettings = () => <Protected><SettingsPage /></Protected>;

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        ...deDE,
        signIn: {
          ...deDE.signIn,
          start: {
            ...deDE.signIn?.start,
            title: "Willkommen zurück",
            subtitle: "Anmelden, um die Artikelliste zu bearbeiten",
          },
        },
        signUp: {
          ...deDE.signUp,
          start: {
            ...deDE.signUp?.start,
            title: "Konto erstellen",
            subtitle: "Zugriff erhält nur das freigegebene Administratorkonto",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/artikel" component={ProtectedList} />
            <Route path="/artikel/neu" component={ProtectedForm} />
            <Route path="/artikel/:id" component={ProtectedForm} />
            <Route path="/einstellungen" component={ProtectedSettings} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
