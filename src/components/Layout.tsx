import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar, Dumbbell, ClipboardList, BookOpen, Settings, History, Play } from "lucide-react";
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
    { path: "/session", icon: Play, label: "Séance" },
    { path: "/calendrier", icon: Calendar, label: "Calendrier" },
    { path: "/historique", icon: History, label: "Historique" },
    { path: "/plans", icon: ClipboardList, label: "Plans" },
    { path: "/exercices", icon: BookOpen, label: "Exercices" },
    { path: "/reglages-ia", icon: Settings, label: "IA" },
  ];

  return (
    <div className="flex flex-col h-screen relative">
      {/* Contenu principal avec scroll */}
      <main className="flex-1 overflow-y-auto pb-20 relative z-10">
        {children}
      </main>

      {/* Navigation en bas */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border/50 overflow-x-auto pb-[env(safe-area-inset-bottom)] z-50">
        <div className="flex items-center h-14 min-w-max px-1 md:justify-around md:max-w-screen-xl md:mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[70px] flex-shrink-0",
                  isActive 
                    ? "text-primary bg-primary/10 shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_8px_rgba(153,69,255,0.5)]")} />
                <span className="text-[11px] font-medium whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
