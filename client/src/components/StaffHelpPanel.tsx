import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HelpCircle,
  Search,
  UserCheck,
  Printer,
  ScanLine,
  Users,
  Info,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import {
  staffHelpKnowledgeBase,
  helpCategories,
  searchHelpArticles,
  getRelatedArticles,
  type HelpArticle,
} from "@/lib/staff-help-knowledge-base";

const categoryIcons: Record<string, React.ReactNode> = {
  'all': <HelpCircle className="h-4 w-4" />,
  'check-in': <UserCheck className="h-4 w-4" />,
  'printing': <Printer className="h-4 w-4" />,
  'scanning': <ScanLine className="h-4 w-4" />,
  'attendees': <Users className="h-4 w-4" />,
  'general': <Info className="h-4 w-4" />,
  'troubleshooting': <AlertTriangle className="h-4 w-4" />,
};

interface StaffHelpPanelProps {
  triggerClassName?: string;
}

export default function StaffHelpPanel({ triggerClassName }: StaffHelpPanelProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);

  const filteredArticles = useMemo(() => {
    return searchHelpArticles(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return getRelatedArticles(selectedArticle.id);
  }, [selectedArticle]);

  const handleArticleClick = (article: HelpArticle) => {
    setSelectedArticle(article);
  };

  const handleBack = () => {
    setSelectedArticle(null);
  };

  const handleRelatedClick = (article: HelpArticle) => {
    setSelectedArticle(article);
  };

  const getCategoryLabel = (categoryId: string) => {
    return helpCategories.find(c => c.id === categoryId)?.label || categoryId;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName}
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help & FAQ
          </SheetTitle>
          <SheetDescription>
            Find answers to common questions about check-in
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {selectedArticle ? (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-1 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to search
              </Button>

              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {getCategoryLabel(selectedArticle.category)}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold">
                  {selectedArticle.question}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedArticle.answer}
                </p>
              </div>

              {relatedArticles.length > 0 && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Related Topics
                  </h4>
                  <div className="space-y-1">
                    {relatedArticles.map((article) => (
                      <Button
                        key={article.id}
                        variant="ghost"
                        className="w-full justify-start text-left h-auto py-2 px-2"
                        onClick={() => handleRelatedClick(article)}
                      >
                        <span className="text-sm truncate">
                          {article.question}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search for help..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {helpCategories.map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                    className="gap-1 text-xs"
                  >
                    {categoryIcons[category.id]}
                    {category.label}
                  </Button>
                ))}
              </div>

              <ScrollArea className="h-[calc(100vh-280px)]">
                {filteredArticles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No results found</p>
                    <p className="text-xs mt-1">Try different keywords or browse categories</p>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="space-y-1">
                    {filteredArticles.map((article) => (
                      <AccordionItem
                        key={article.id}
                        value={article.id}
                        className="border rounded-lg px-3"
                      >
                        <AccordionTrigger className="text-sm text-left hover:no-underline py-3">
                          <div className="flex items-start gap-2 pr-2">
                            {categoryIcons[article.category]}
                            <span>{article.question}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground pb-3">
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {article.answer}
                          </p>
                          {article.relatedArticles && article.relatedArticles.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 p-0 h-auto text-xs text-primary"
                              onClick={() => handleArticleClick(article)}
                            >
                              View related topics →
                            </Button>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </ScrollArea>

              <div className="pt-2 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  Can't find what you need? Contact your event admin.
                </p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
