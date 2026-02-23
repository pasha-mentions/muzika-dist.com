import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Music, Clock, CheckCircle, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface QCQueueProps {
  data: any[];
  isLoading: boolean;
}

export default function QCQueue({ data: qcQueue = [], isLoading }: QCQueueProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async (releaseId: string) => {
      await apiRequest("POST", `/api/admin/releases/${releaseId}/approve`);
    },
    onSuccess: () => {
      toast({
        title: "Release Approved",
        description: "The release has been approved and queued for distribution",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qc-queue"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Approval Failed",
        description: "Failed to approve release. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ releaseId, reason }: { releaseId: string; reason: string }) => {
      await apiRequest("POST", `/api/admin/releases/${releaseId}/reject`, { reason });
    },
    onSuccess: () => {
      toast({
        title: "Release Rejected",
        description: "The release has been rejected and returned to the artist",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/qc-queue"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Rejection Failed",
        description: "Failed to reject release. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (releaseId: string) => {
    approveMutation.mutate(releaseId);
  };

  const handleReject = (releaseId: string) => {
    const reason = prompt("Please provide a reason for rejection:");
    if (reason) {
      rejectMutation.mutate({ releaseId, reason });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Quality Control Queue</CardTitle>
          <Badge variant="secondary" data-testid="qc-queue-count">
            {qcQueue.length} Pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-muted rounded-lg"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-32"></div>
                    <div className="h-3 bg-muted rounded w-24"></div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <div className="h-6 w-16 bg-muted rounded"></div>
                  <div className="h-6 w-16 bg-muted rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : qcQueue.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">All Clear!</h3>
            <p className="text-muted-foreground">
              No releases pending quality control review
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {qcQueue.map((release: any) => (
              <div 
                key={release.id} 
                className="flex items-center justify-between p-3 bg-card rounded-lg border border-border"
                data-testid={`qc-item-${release.id}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Music className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground" data-testid={`release-title-${release.id}`}>
                      {release.title}
                    </p>
                    <div className="flex items-center space-x-2">
                      <p className="text-xs text-muted-foreground">
                        {release.artist?.name} • {release.organization?.name}
                      </p>
                      <span className="text-xs text-muted-foreground">•</span>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" />
                        Submitted {new Date(release.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApprove(release.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
                    data-testid={`approve-${release.id}`}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(release.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                    data-testid={`reject-${release.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`review-${release.id}`}
                  >
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
