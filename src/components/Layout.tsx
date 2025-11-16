import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Dumbbell, ClipboardList, BookOpen, Settings, History } from "lucide-react";
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
    { path: "/historique", icon: History, label: "Historique" },
    { path: "/plans", icon: ClipboardList, label: "Plans" },
    { path: "/exercices", icon: BookOpen, label: "Exercices" },
    { path: "/reglages-ia", icon: Settings, label: "IA" },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Contenu principal avec scroll */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Navigation en bas */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border overflow-x-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center h-12 min-w-max px-1 md:justify-around md:max-w-screen-xl md:mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 rounded-lg transition-colors min-w-[64px] flex-shrink-0",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
