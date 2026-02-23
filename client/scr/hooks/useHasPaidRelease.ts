import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

interface HasPaidReleaseResponse {
  hasPaidRelease: boolean;
}

export function useHasPaidRelease() {
  const { data, isLoading } = useQuery<HasPaidReleaseResponse>({
    queryKey: ["/api/releases/has-paid"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000,
  });

  return {
    hasPaidRelease: data?.hasPaidRelease ?? false,
    isLoading,
  };
}
