import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

interface CuratorRouteProps {
  component: React.ComponentType;
}

export function CuratorRoute({ component: Component }: CuratorRouteProps) {
  const { isCurator, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
      </div>
    );
  }
  
  if (!isCurator) {
    return <Redirect to="/dashboard" />;
  }
  
  return <Component />;
}
