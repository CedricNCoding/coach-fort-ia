import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import Calendar from "./pages/Calendar";
import Plans from "./pages/Plans";
import PlanDetail from "./pages/PlanDetail";
import Exercises from "./pages/Exercises";
import Session from "./pages/Session";
import SessionSummary from "./pages/SessionSummary";
import AISettings from "./pages/AISettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<Navigate to="/calendrier" replace />} />
          <Route path="/calendrier" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
          <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
          <Route path="/plans/:id" element={<ProtectedRoute><PlanDetail /></ProtectedRoute>} />
          <Route path="/exercices" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
          <Route path="/session" element={<ProtectedRoute><Session /></ProtectedRoute>} />
          <Route path="/session-summary/:sessionId" element={<ProtectedRoute><SessionSummary /></ProtectedRoute>} />
          <Route path="/reglages-ia" element={<ProtectedRoute><AISettings /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
