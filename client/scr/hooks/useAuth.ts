import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getQueryFn } from "@/lib/queryClient";
import type { User, Organization } from "@shared/schema";
import i18n from "@/i18n";

interface AuthUser extends User {
  organizations?: Organization[];
  isOrganizationFrozen?: boolean;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (user?.preferredLanguage && i18n.language !== user.preferredLanguage) {
      i18n.changeLanguage(user.preferredLanguage);
      localStorage.setItem('language', user.preferredLanguage);
    }
  }, [user?.preferredLanguage]);

  const currentOrg = user?.organizations?.[0];
  const isCurator = currentOrg?.type === 'PLAYLIST_CURATOR';

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isPlatformAdmin: user?.platformRole !== null && user?.platformRole !== undefined,
    isPlatformOwner: user?.platformRole === "PLATFORM_OWNER",
    isOrganizationFrozen: user?.isOrganizationFrozen === true,
    isCurator,
    currentOrg,
  };
}
