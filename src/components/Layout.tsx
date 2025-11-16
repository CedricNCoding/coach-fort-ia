import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Dumbbell, ClipboardList, BookOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

/**
 * Layout principal avec navigation en bas (onglets)
 */
export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: "/calendrier", icon: Calendar, label: "Calendrier" },
    { path: "/seance", icon: Dumbbell, label: "Séance" },
    { path: "/plans", icon: ClipboardList, label: "Plans" },
    { path: "/exercices", icon: BookOpen, label: "Exercices" },
    { path: "/reglages", icon: Settings, label: "Réglages" },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Contenu principal avec scroll */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Navigation en bas */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border">
        <div className="flex justify-around items-center h-16 max-w-screen-xl mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
