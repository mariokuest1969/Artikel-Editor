import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ArticlesList from "@/pages/articles-list";
import ArticleForm from "@/pages/article-form";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={ArticlesList} />
      <Route path="/artikel/neu" component={ArticleForm} />
      <Route path="/artikel/:id" component={ArticleForm} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
