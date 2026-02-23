import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Music, Clock, CheckCircle, XCircle, ImageIcon, User, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import ReleaseDetailsModal from "./release-details-modal";

interface Release {
  id: string;
  title: string;
  artist: {
    id: string;
    name: string;
    pseudonym?: string;
  };
  organization: {
    id: string;
    name: string;
  };
  status: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  createdAt: string;
  updatedAt: string;
  artworkUrl?: string;
  tracks?: {
    title: string;
  }[];
}

export default function ReleasesTab() {
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const { data: releases = [], isLoading, error } = useQuery({
    queryKey: ["/api/releases"],
    enabled: isPlatformAdmin,
    retry: false,
  });

  if (error && isUnauthorizedError(error as Error)) {
    return null; // Will redirect via parent component
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>User Releases</CardTitle>
          <Badge variant="secondary" data-testid="releases-count">
            {(releases as Release[]).length} Total
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                <div className="aspect-square bg-muted rounded-lg mb-3"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (releases as Release[]).length === 0 ? (
          <div className="text-center py-12">
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Releases Yet</h3>
            <p className="text-muted-foreground">
              No releases have been uploaded by users yet
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(releases as Release[]).map((release: Release) => (
              <div 
                key={release.id} 
                className="bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow"
                data-testid={`release-card-${release.id}`}
              >
                {/* Cover Art */}
                <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  {release.artworkUrl ? (
                    <img 
                      src={release.artworkUrl} 
                      alt={release.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.removeAttribute('style');
                      }}
                    />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-muted-foreground" />
                  )}
                </div>
                
                {/* Release Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground mb-1 truncate" data-testid={`release-title-${release.id}`}>
                    {release.title}
                  </h3>
                  <div className="flex items-center text-sm text-muted-foreground mb-2">
                    <User className="w-3 h-3 mr-1" />
                    <span className="truncate" data-testid={`release-artist-${release.id}`}>
                      {release.artist.pseudonym || release.artist.name}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={
                        release.status === 'APPROVED' ? 'default' :
                        release.status === 'DELIVERED' ? 'secondary' :
                        release.status === 'IN_REVIEW' ? 'outline' :
                        'destructive'
                      }>
                        {release.status.replace('_', ' ')}
                      </Badge>
                      {release.paymentStatus && (
                        <Badge variant={
                          release.paymentStatus === 'PAID' ? 'default' :
                          release.paymentStatus === 'PROCESSING' ? 'outline' :
                          release.paymentStatus === 'FAILED' ? 'destructive' :
                          'secondary'
                        }>
                          {release.paymentStatus === 'PAID' ? '💰' : 
                           release.paymentStatus === 'PROCESSING' ? '⏳' :
                           release.paymentStatus === 'FAILED' ? '❌' : '⏸️'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(release.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  {/* Action Buttons for Pending Reviews */}
                  {release.status === 'IN_REVIEW' && (
                    <div className="flex space-x-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950 flex-1"
                        data-testid={`approve-${release.id}`}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950 flex-1"
                        data-testid={`reject-${release.id}`}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                  
                  {/* View Details Button */}
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelectedReleaseId(release.id);
                        setIsDetailsModalOpen(true);
                      }}
                      data-testid={`view-details-${release.id}`}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Переглянути деталі
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Release Details Modal */}
      <ReleaseDetailsModal
        releaseId={selectedReleaseId}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedReleaseId(null);
        }}
      />
    </Card>
  );
}