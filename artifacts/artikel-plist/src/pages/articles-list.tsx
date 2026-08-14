import { useState } from "react";
import { Link } from "wouter";
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Edit, Plus } from "lucide-react";
import { 
  useListArticles, 
  useGetMeta, 
  getListArticlesQueryKey, 
  getGetMetaQueryKey 
} from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ArticlesList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [sparte, setSparte] = useState<string>("all");
  const [wg, setWg] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Poll every 60 seconds so the UI picks up background auto-sync changes
  // within a minute of them landing on the server.
  const { data: meta } = useGetMeta({
    query: {
      queryKey: getGetMetaQueryKey(),
      refetchInterval: 60_000,
    },
  });
  
  const { data, isLoading } = useListArticles(
    { 
      search: debouncedSearch || undefined, 
      sparte: sparte !== "all" ? sparte : undefined, 
      wg: wg !== "all" ? wg : undefined, 
      page, 
      pageSize 
    },
    { 
      query: { 
        queryKey: getListArticlesQueryKey({ search: debouncedSearch || undefined, sparte: sparte !== "all" ? sparte : undefined, wg: wg !== "all" ? wg : undefined, page, pageSize }),
        refetchInterval: 60_000,
      } 
    }
  );

  const handleSparteChange = (val: string) => {
    setSparte(val);
    setPage(1);
  };

  const handleWgChange = (val: string) => {
    setWg(val);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Articles</h2>
          <p className="text-muted-foreground mt-1">Manage pricing, taxes, and properties for all POS articles.</p>
        </div>
        <Link href="/artikel/neu">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Article
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-lg shadow-sm">
        <div className="p-4 border-b flex flex-col md:flex-row gap-4 items-center bg-muted/20">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Search by article name, ID, or barcode..." 
              className="pl-9 bg-background w-full"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <Select value={sparte} onValueChange={handleSparteChange}>
              <SelectTrigger className="w-[180px] bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Sparte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sparten</SelectItem>
                {meta?.sparten?.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={wg} onValueChange={handleWgChange}>
              <SelectTrigger className="w-[180px] bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Warengruppe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Warengruppen</SelectItem>
                {meta?.warengruppen?.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Article Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Printer</TableHead>
                <TableHead>Sparte</TableHead>
                <TableHead>WG</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-48 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-muted rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-8 w-8 bg-muted rounded animate-pulse ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.items?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No articles found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                data?.items?.map((article) => (
                  <TableRow key={article.ArtikelId} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs text-muted-foreground">{article.ArtikelId}</TableCell>
                    <TableCell className="font-medium">{article.Artikel}</TableCell>
                    <TableCell>
                      {article.Preis ? (
                        <span className="font-medium text-primary">€{parseFloat(article.Preis.replace(",", ".")).toFixed(2)}</span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {article.MWSt ? (
                        <Badge variant="outline" className="bg-background">{article.MWSt}%</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{article.Drucker || "-"}</span>
                    </TableCell>
                    <TableCell>
                      {article.Sparte ? <Badge variant="secondary" className="font-normal">{article.Sparte}</Badge> : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{article.WG || "-"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/artikel/${article.ArtikelId}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {data && data.total > 0 && (
          <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground bg-muted/10">
            <div>
              Showing <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * pageSize, data.total)}</span> of <span className="font-medium text-foreground">{data.total}</span> results
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-2 font-medium text-foreground">
                Page {page} of {totalPages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
