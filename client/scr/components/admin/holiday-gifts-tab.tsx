import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gift, Check, Clock, Package, Users, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface GiftClaim {
  id: string;
  organizationId: string;
  prizeId: string;
  placementId: string;
  assignedAt: string;
  claimedAt: string | null;
  claimedByUserId: string | null;
  prizeName: string;
  prizeDescription: string;
  organizationName: string;
  organizationType: string;
  claimedByUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface GiftStats {
  enabled: boolean;
  prizes: {
    id: string;
    name: string;
    totalLimit: number;
    claimedCount: number;
    remaining: number;
  }[];
  stats: {
    totalPrizes: number;
    totalClaimed: number;
    totalAssignments: number;
    claimedAssignments: number;
  };
}

export default function HolidayGiftsTab() {
  const { isPlatformAdmin, isLoading: authLoading } = useAuth();
  
  const isAdmin = !!isPlatformAdmin && !authLoading;
  
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = useQuery<{ claims: GiftClaim[] }>({
    queryKey: ["/api/admin/holiday-gifts/claims"],
    enabled: isAdmin,
  });

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery<GiftStats>({
    queryKey: ["/api/admin/holiday-gifts/stats"],
    enabled: isAdmin,
  });

  const claims = claimsData?.claims || [];
  const stats = statsData?.stats;
  const prizes = statsData?.prizes || [];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Доступ заборонено</h3>
        <p className="text-muted-foreground">Ця сторінка доступна тільки адміністраторам</p>
      </div>
    );
  }

  if (claimsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (claimsError || statsError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold">Помилка завантаження</h3>
        <p className="text-muted-foreground">Не вдалося завантажити дані подарунків</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
          <Gift className="w-5 h-5 text-purple-500" />
          Новорічні подарунки
        </h2>
        <p className="text-sm text-muted-foreground">
          Перегляд статистики та переможців святкової акції
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Всього призів</p>
                <p className="text-2xl font-bold">{stats?.totalPrizes || 0}</p>
              </div>
              <Package className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Роздано</p>
                <p className="text-2xl font-bold text-green-600">{stats?.totalClaimed || 0}</p>
              </div>
              <Check className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Організацій</p>
                <p className="text-2xl font-bold">{stats?.totalAssignments || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Забрали</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.claimedAssignments || 0}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Призи по категоріях</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {prizes.map((prize) => (
              <div key={prize.id} className="p-3 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium truncate" title={prize.name}>{prize.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {prize.claimedCount}/{prize.totalLimit}
                  </span>
                  <Badge variant={prize.remaining > 0 ? "secondary" : "destructive"} className="text-xs">
                    {prize.remaining > 0 ? `${prize.remaining} лишилось` : "Вичерпано"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Переможці ({claims.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Поки що немає переможців
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Організація</TableHead>
                  <TableHead>Приз</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Забрав</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{claim.organizationName || "Невідома організація"}</p>
                        <p className="text-xs text-muted-foreground">
                          {claim.organizationType === "LABEL" ? "Лейбл" : "Артист"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{claim.prizeName}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={claim.prizeDescription}>
                          {claim.prizeDescription}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {claim.claimedAt ? (
                        <Badge variant="default" className="bg-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Забрано
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="w-3 h-3 mr-1" />
                          Очікує
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {claim.claimedByUser ? (
                        <div>
                          <p className="text-sm">
                            {claim.claimedByUser.firstName} {claim.claimedByUser.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{claim.claimedByUser.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {claim.claimedAt ? (
                        <span className="text-sm">
                          {format(new Date(claim.claimedAt), "dd MMM yyyy, HH:mm", { locale: uk })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
