import { ChevronRight, Home, MoreHorizontal } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function Breadcrumbs() {
  const { breadcrumbs, clearAllContext } = useNavigation();
  const [, setLocation] = useLocation();

  if (breadcrumbs.length === 0) {
    return null;
  }

  const renderFullBreadcrumbs = () => (
    <>
      {breadcrumbs.map((crumb, index) => (
        <div key={index} className="flex items-center min-w-0">
          <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-muted-foreground/50" />
          {crumb.href && !crumb.current ? (
            <Link 
              href={crumb.href} 
              className="hover:text-foreground hover-elevate px-1.5 py-0.5 rounded transition-colors truncate max-w-[120px] lg:max-w-[180px]"
              data-testid={`link-breadcrumb-${index}`}
              title={crumb.label}
            >
              {crumb.label}
            </Link>
          ) : (
            <span 
              className={`truncate max-w-[120px] lg:max-w-[200px] ${crumb.current ? "text-foreground font-medium" : ""}`}
              data-testid={`text-breadcrumb-${index}`}
              title={crumb.label}
            >
              {crumb.label}
            </span>
          )}
        </div>
      ))}
    </>
  );

  const renderCollapsedBreadcrumbs = () => {
    if (breadcrumbs.length <= 2) {
      return renderFullBreadcrumbs();
    }

    const middleItems = breadcrumbs.slice(0, -1);
    const lastItem = breadcrumbs[breadcrumbs.length - 1];

    return (
      <>
        <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-muted-foreground/50" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              data-testid="button-breadcrumb-expand"
              aria-label="Show full navigation path"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Show full navigation path</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {middleItems.map((crumb, index) => (
              <DropdownMenuItem key={index} asChild>
                {crumb.href ? (
                  <Link 
                    href={crumb.href}
                    className="cursor-pointer"
                    data-testid={`link-breadcrumb-dropdown-${index}`}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-muted-foreground/50" />
        <span 
          className="text-foreground font-medium truncate max-w-[150px]"
          data-testid="text-breadcrumb-current"
          title={lastItem.label}
        >
          {lastItem.label}
        </span>
      </>
    );
  };

  return (
    <nav 
      className="flex items-center text-sm text-muted-foreground min-w-0" 
      aria-label="Breadcrumb" 
      data-testid="nav-breadcrumbs"
    >
      <button 
        onClick={() => {
          localStorage.removeItem("checkmate_last_path");
          clearAllContext();
          setLocation('/');
        }}
        className="hover-elevate p-1.5 rounded flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors" 
        data-testid="link-breadcrumb-home"
        title="Home"
        aria-label="Home"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Home</span>
      </button>
      
      <div className="hidden md:flex items-center min-w-0">
        {renderFullBreadcrumbs()}
      </div>
      
      <div className="flex md:hidden items-center min-w-0">
        {renderCollapsedBreadcrumbs()}
      </div>
    </nav>
  );
}
