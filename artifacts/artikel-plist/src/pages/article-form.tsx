import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { ArrowLeft, Save, Trash2, AlertTriangle, Loader2, Copy } from "lucide-react";
import { 
  useGetArticle, 
  useCreateArticle, 
  useCloneArticle,
  useUpdateArticle, 
  useDeleteArticle,
  useGetMeta,
  getGetArticleQueryKey,
  getGetMetaQueryKey,
  getListArticlesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// Schema based on ArticleInput
const formSchema = z.object({
  ArtikelId: z.string().optional(),
  Artikel: z.string().min(1, "Article name is required"),
  BarCode: z.string().optional().default(""),
  ComboArtikel: z.string().optional().default(""),
  Drucker: z.string().optional().default(""),
  FreierPreis: z.string().optional().default("0"),
  Gutschrift: z.string().optional().default("0"),
  LongText: z.string().optional().default(""),
  MWSt: z.string().optional().default(""),
  MWStAH: z.string().optional().default(""),
  Maincourse: z.string().optional().default("0"),
  NichtUmsatzRelevant: z.string().optional().default("0"),
  PicturePath: z.string().optional().default(""),
  Preis: z.string().optional().default(""),
  PreisAH: z.string().optional().default(""),
  Preisliste: z.string().optional().default(""),
  RabattAusnahme: z.string().optional().default("0"),
  Rezeptur: z.string().optional().default(""),
  Sparte: z.string().optional().default(""),
  SpartenId: z.string().optional().default(""),
  SpartenSteuerung: z.string().optional().default("0"),
  WG: z.string().optional().default(""),
  Zusatztext: z.string().optional().default(""),
  // Advanced fields
  FollowStock: z.string().optional().default(""),
  ArticleDailyInitialCount: z.string().optional().default(""),
  Expenses: z.string().optional().default("0"),
  Intern: z.string().optional().default("0"),
  Manufacturer: z.string().optional().default(""),
  ManufacturerID: z.string().optional().default(""),
  ManufacturerItemName: z.string().optional().default(""),
  Naehrwertangaben: z.string().optional().default(""),
  Ordercode: z.string().optional().default(""),
  PurchasePrice: z.string().optional().default(""),
  sort: z.string().optional().default(""),
  articleTSE: z.string().optional().default(""),
  printEvenZero: z.string().optional().default("0"),
  showArticleOnlyForThisUser: z.string().optional().default(""),
  ArtikelTextLang: z.string().optional().default(""),
});

type FormValues = z.infer<typeof formSchema>;

// Plist stores prices/percentages with German decimal comma (e.g. "3,50", "19,00").
// HTML number inputs only accept dot-decimal. Convert on load and restore on save.
const GERMAN_DECIMAL_FIELDS = ["Preis", "PreisAH", "MWSt", "MWStAH", "PurchasePrice"];
const germanToDecimal = (v: string) => v.replace(",", ".");
const decimalToGerman = (v: string) => v.replace(".", ",");

export default function ArticleForm() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/artikel/:id");
  const isNew = !params?.id || params.id === "neu";
  const articleId = isNew ? "" : params.id!;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: meta } = useGetMeta({ query: { queryKey: getGetMetaQueryKey() } });
  
  const { data: article, isLoading: isLoadingArticle } = useGetArticle(articleId, {
    query: {
      enabled: !isNew && !!articleId,
      queryKey: getGetArticleQueryKey(articleId)
    }
  });

  const createMutation = useCreateArticle();
  const cloneMutation = useCloneArticle();
  const updateMutation = useUpdateArticle();
  const deleteMutation = useDeleteArticle();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      Artikel: "",
      FreierPreis: "0",
      Gutschrift: "0",
      Maincourse: "0",
      NichtUmsatzRelevant: "0",
      RabattAusnahme: "0",
      SpartenSteuerung: "0",
      Expenses: "0",
      Intern: "0",
      printEvenZero: "0",
    }
  });

  useEffect(() => {
    // Wait for both article data AND meta (dropdown options) to be available before
    // resetting the form. If form.reset() fires before SelectItems are rendered, the
    // Select component cannot match the value to an option and shows the placeholder.
    if (article && !isNew && meta) {
      // Map API data to form; convert German comma-decimal to dot-decimal for number inputs
      const data: Record<string, string> = {};
      Object.entries(article).forEach(([key, value]) => {
        const v = value || "";
        data[key] = GERMAN_DECIMAL_FIELDS.includes(key) ? germanToDecimal(v) : v;
      });
      form.reset(data as FormValues);
    }
  }, [article, isNew, form, meta]);

  const onSubmit = (values: FormValues) => {
    // Clean up empty optional fields
    const cleanedValues: any = { ...values };
    Object.keys(cleanedValues).forEach(key => {
      if (cleanedValues[key] === "") {
        delete cleanedValues[key];
      }
    });
    // Convert dot-decimal back to German comma-decimal for plist storage
    GERMAN_DECIMAL_FIELDS.forEach(field => {
      if (cleanedValues[field]) {
        cleanedValues[field] = decimalToGerman(String(cleanedValues[field]));
      }
    });

    if (isNew) {
      createMutation.mutate({ data: cleanedValues }, {
        onSuccess: () => {
          toast({ title: "Article created", description: "The article has been successfully created." });
          queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
          setLocation("/");
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message || "Failed to create article", variant: "destructive" });
        }
      });
    } else {
      updateMutation.mutate({ id: articleId, data: cleanedValues }, {
        onSuccess: () => {
          toast({ title: "Article updated", description: "The article has been successfully saved." });
          queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetArticleQueryKey(articleId) });
          // Optional: redirect back to list
          // setLocation("/");
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message || "Failed to update article", variant: "destructive" });
        }
      });
    }
  };

  const handleClone = () => {
    if (cloneMutation.isPending || !article) return;
    cloneMutation.mutate({ id: articleId }, {
      onSuccess: (copy) => {
        queryClient.setQueryData(getGetArticleQueryKey(copy.ArtikelId), copy);
        queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMetaQueryKey() });
        toast({
          title: "Artikel geklont",
          description: `Die Kopie hat die Artikelnummer ${copy.ArtikelId}.`,
        });
        setLocation(`/artikel/${encodeURIComponent(copy.ArtikelId)}`);
      },
      onError: (error) => {
        toast({ title: "Klonen fehlgeschlagen", description: error.message, variant: "destructive" });
      },
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: articleId }, {
      onSuccess: () => {
        toast({ title: "Article deleted", description: "The article has been removed." });
        queryClient.invalidateQueries({ queryKey: getListArticlesQueryKey() });
        setLocation("/");
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message || "Failed to delete article", variant: "destructive" });
      }
    });
  };

  if (!isNew && isLoadingArticle) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending || cloneMutation.isPending;

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{isNew ? "New Article" : "Edit Article"}</h2>
            <p className="text-muted-foreground mt-1">
              {isNew ? "Add a new item to your POS system." : `Editing ${article?.Artikel || articleId}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isPending || !article || deleteMutation.isPending}>
                  <Copy className="w-4 h-4 mr-2" />
                  {cloneMutation.isPending ? "Wird geklont…" : "Artikel klonen"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Artikel klonen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die gespeicherten Daten von „{article?.Artikel}“ werden kopiert und in Dropbox
                    gespeichert. Die neue Artikelnummer liegt um eins über der höchsten vorhandenen
                    Nummer. Nicht gespeicherte Änderungen werden nicht übernommen; der Originalartikel
                    bleibt unverändert. Anschließend wird die Kopie zum Bearbeiten geöffnet.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClone}>Kopie erstellen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="h-10 w-10">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Delete Article
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this article? This action cannot be undone and will be synchronized to the POS.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending} className="px-6">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {!isPending && <Save className="w-4 h-4 mr-2" />}
            Save Article
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Info Column */}
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Core details that appear on the POS screen.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="Artikel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Article Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Cappuccino" {...field} className="text-lg font-medium" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="Sparte"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sparte (Category Group)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Sparte" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {meta?.sparten?.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="WG"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Warengruppe (WG)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select WG" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {meta?.warengruppen?.map((w) => (
                                <SelectItem key={w} value={w}>{w}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="Zusatztext"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Text (Receipt/Kitchen)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Extra hot" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="ArtikelTextLang"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Long Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Detailed description..." {...field} className="resize-none h-24" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pricing & Tax</CardTitle>
                  <CardDescription>Configure standard and takeout pricing.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold border-b pb-2">In-House</h4>
                      <FormField
                        control={form.control}
                        name="Preis"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price (€)</FormLabel>
                            <FormControl>
                              <Input placeholder="0.00" type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="MWSt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Rate (%)</FormLabel>
                            <FormControl>
                              <Input placeholder="19" type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-sm font-semibold border-b pb-2">Takeout (Außer Haus)</h4>
                      <FormField
                        control={form.control}
                        name="PreisAH"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price AH (€)</FormLabel>
                            <FormControl>
                              <Input placeholder="0.00" type="number" step="0.01" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="MWStAH"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Rate AH (%)</FormLabel>
                            <FormControl>
                              <Input placeholder="7" type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-4">
                    <FormField
                      control={form.control}
                      name="FreierPreis"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm w-full">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Free Pricing</FormLabel>
                            <FormDescription>
                              Allow manual price entry at checkout
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value === "1"}
                              onCheckedChange={(checked) => field.onChange(checked ? "1" : "0")}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Column */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>POS Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isNew && (
                    <FormField
                      control={form.control}
                      name="ArtikelId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Article ID</FormLabel>
                          <FormControl>
                            <Input {...field} disabled className="bg-muted font-mono" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                  
                  <FormField
                    control={form.control}
                    name="BarCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Barcode</FormLabel>
                        <FormControl>
                          <Input placeholder="Scan barcode..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="Drucker"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Printer</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Printer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {meta?.druckerListe?.map((d) => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="Preisliste"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price List</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select List" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {meta?.preislisten?.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator className="my-4" />
                  
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="Maincourse"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <Switch checked={field.value === "1"} onCheckedChange={(checked) => field.onChange(checked ? "1" : "0")} />
                          </FormControl>
                          <FormLabel className="font-normal">Main Course (Course Mgmt)</FormLabel>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="NichtUmsatzRelevant"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <Switch checked={field.value === "1"} onCheckedChange={(checked) => field.onChange(checked ? "1" : "0")} />
                          </FormControl>
                          <FormLabel className="font-normal">Not Revenue Relevant</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="advanced" className="border rounded-lg bg-card px-4 shadow-sm">
                  <AccordionTrigger className="hover:no-underline">
                    <span className="font-semibold">Advanced Settings</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4 pb-2">
                    <FormField
                      control={form.control}
                      name="Ordercode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Order Code</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="sort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sort Order</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="FollowStock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Follow Stock</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <div className="pt-2 space-y-3">
                      <FormField
                        control={form.control}
                        name="printEvenZero"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <Switch checked={field.value === "1"} onCheckedChange={(checked) => field.onChange(checked ? "1" : "0")} />
                            </FormControl>
                            <FormLabel className="font-normal text-sm">Print if Price 0</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </form>
      </Form>
    </Layout>
  );
}
