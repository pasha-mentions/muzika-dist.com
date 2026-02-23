import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  FolderOpen, 
  Link as LinkIcon, 
  Trash2, 
  RefreshCw, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  PlayCircle,
  Loader2,
  History,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  Search
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface DriveFolderMapping {
  id: string;
  orgId: string;
  driveFolderId: string;
  driveFolderName: string;
  linkedBy: string;
  linkedAt: string;
  lastSyncedAt: string | null;
  lastImportAttemptAt: string | null;
  lastSuccessfulImportAt: string | null;
}

interface ImportLog {
  id: string;
  orgId: string;
  driveFileId: string | null;
  driveFileName: string | null;
  reportPeriod: string | null;
  status: 'SUCCESS' | 'ERROR' | 'DUPLICATE' | 'SKIPPED';
  errorMessage: string | null;
  reportId: string | null;
  importedAt: string;
}

interface ImportCheckpoint {
  id: string;
  createdAt: string;
  lastReportId: string | null;
  lastReportCount: number;
  description: string | null;
  createdBy: string;
  creatorEmail: string | null;
  status: 'ACTIVE' | 'ROLLED_BACK';
  rolledBackAt: string | null;
  rolledBackBy: string | null;
}

interface SafetyCheck {
  safe: boolean;
  reason?: string;
  affectedReports: number;
}

interface UnlinkedOrgMatch {
  orgId: string;
  orgName: string;
  orgType: string;
  driveFolderId: string;
  driveFolderName: string;
}

interface UnlinkedOrgsResponse {
  totalDriveFolders: number;
  totalOrganizations: number;
  totalLinked: number;
  unlinkedMatches: UnlinkedOrgMatch[];
}

export default function DriveImportManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [driveFolderId, setDriveFolderId] = useState<string>('');
  const [driveFolderName, setDriveFolderName] = useState<string>('');
  const [taxDeductionType, setTaxDeductionType] = useState<string>('none');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<string>('');
  const [logFilterOrg, setLogFilterOrg] = useState<string>('all');
  const [logFilterStatus, setLogFilterStatus] = useState<string>('all');
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [checkpointToRollback, setCheckpointToRollback] = useState<ImportCheckpoint | null>(null);
  const [safetyCheck, setSafetyCheck] = useState<SafetyCheck | null>(null);
  const [checkingSafety, setCheckingSafety] = useState(false);
  const [importingOrgId, setImportingOrgId] = useState<string | null>(null);
  const [linkingOrgId, setLinkingOrgId] = useState<string | null>(null);
  const [unlinkedTaxMap, setUnlinkedTaxMap] = useState<Record<string, string>>({});

  // Fetch organizations
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  // Fetch Drive folder mappings
  const { data: driveFolders = [], isLoading: foldersLoading } = useQuery<DriveFolderMapping[]>({
    queryKey: ['/api/admin/streaming-reports/drive-folders'],
  });

  // Fetch import logs (with optional org filter) - CUSTOM QUERYFN for structured key
  const { data: importLogs = [], isLoading: logsLoading } = useQuery<ImportLog[]>({
    queryKey: ['/api/admin/streaming-reports/import-logs', { orgId: logFilterOrg }],
    queryFn: async ({ queryKey }) => {
      const [path, params] = queryKey as [string, { orgId: string }];
      const url = params.orgId !== 'all' ? `${path}?orgId=${params.orgId}` : path;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch import logs');
      return res.json();
    },
    staleTime: 0,
  });

  // Fetch import checkpoints
  const { data: checkpoints = [], isLoading: checkpointsLoading } = useQuery<ImportCheckpoint[]>({
    queryKey: ['/api/admin/import-checkpoints'],
  });

  // Fetch unlinked organizations with matching Drive folders
  const { data: unlinkedOrgsData, isLoading: unlinkedLoading, refetch: refetchUnlinked } = useQuery<UnlinkedOrgsResponse>({
    queryKey: ['/api/admin/streaming-reports/unlinked-drive-orgs'],
    enabled: false,
  });

  // Quick-link mutation for unlinked orgs
  const quickLinkMutation = useMutation({
    mutationFn: async (match: UnlinkedOrgMatch) => {
      const taxType = unlinkedTaxMap[match.orgId] || 'none';
      const response = await fetch(`/api/admin/streaming-reports/org/${match.orgId}/drive-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveFolderId: match.driveFolderId,
          driveFolderName: match.driveFolderName,
          taxDeductionType: taxType === 'none' ? '' : taxType,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to link folder');
      }

      return response.json();
    },
    onSuccess: (_data, match) => {
      toast({
        title: 'Прив\'язано',
        description: `${match.orgName} → ${match.driveFolderName}`,
      });
      setLinkingOrgId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/drive-folders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/unlinked-drive-orgs'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Помилка',
        description: error.message,
        variant: 'destructive',
      });
      setLinkingOrgId(null);
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (checkpointId: string) => {
      const response = await fetch(`/api/admin/import-checkpoints/${checkpointId}/rollback`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rollback');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Відкат виконано',
        description: data.message,
      });
      setRollbackDialogOpen(false);
      setCheckpointToRollback(null);
      setSafetyCheck(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/import-checkpoints'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/import-logs'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Помилка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Check safety before rollback
  const handleCheckSafety = async (checkpoint: ImportCheckpoint) => {
    setCheckpointToRollback(checkpoint);
    setRollbackDialogOpen(true);
    setCheckingSafety(true);
    setSafetyCheck(null);

    try {
      const res = await fetch(`/api/admin/import-checkpoints/${checkpoint.id}/safety-check`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to check safety');
      const result = await res.json();
      setSafetyCheck(result);
    } catch (error) {
      toast({
        title: 'Помилка',
        description: 'Не вдалося перевірити безпеку відкату',
        variant: 'destructive',
      });
      setRollbackDialogOpen(false);
    } finally {
      setCheckingSafety(false);
    }
  };

  // Set folder mutation
  const setFolderMutation = useMutation({
    mutationFn: async (data: { orgId: string; driveFolderId: string; driveFolderName: string; taxDeductionType?: string }) => {
      const response = await fetch(`/api/admin/streaming-reports/org/${data.orgId}/drive-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveFolderId: data.driveFolderId,
          driveFolderName: data.driveFolderName,
          taxDeductionType: data.taxDeductionType || null,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to set Drive folder');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Drive folder linked successfully',
      });
      setSelectedOrgId('');
      setDriveFolderId('');
      setDriveFolderName('');
      setTaxDeductionType('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/drive-folders'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remove folder mutation
  const removeFolderMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await fetch(`/api/admin/streaming-reports/org/${orgId}/drive-folder`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove Drive folder');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Drive folder removed successfully',
      });
      setDeleteDialogOpen(false);
      setOrgToDelete('');
      queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/drive-folders'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Manual import trigger mutation
  const triggerImportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/streaming-reports/manual-import', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to trigger import');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Import Job Started',
        description: 'Check server logs for progress. Page will refresh in 5 seconds.',
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/import-logs'] });
      }, 5000);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Single organization import mutation
  const triggerOrgImportMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await fetch(`/api/admin/streaming-reports/manual-import/${orgId}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to trigger import');
      }

      return response.json();
    },
    onMutate: (orgId) => {
      setImportingOrgId(orgId);
    },
    onSuccess: (_, orgId) => {
      const orgName = getOrgName(orgId);
      toast({
        title: 'Import Started',
        description: `Import job started for "${orgName}". Check logs for progress.`,
      });
      setImportingOrgId(null);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/import-logs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/streaming-reports/drive-folders'] });
      }, 3000);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setImportingOrgId(null);
    },
  });

  const handleSetFolder = () => {
    if (!selectedOrgId || !driveFolderId || !driveFolderName) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    setFolderMutation.mutate({
      orgId: selectedOrgId,
      driveFolderId,
      driveFolderName,
      taxDeductionType: taxDeductionType === 'none' ? '' : taxDeductionType,
    });
  };

  const handleRemoveFolder = (orgId: string) => {
    setOrgToDelete(orgId);
    setDeleteDialogOpen(true);
  };

  const confirmRemove = () => {
    removeFolderMutation.mutate(orgToDelete);
  };

  const getStatusBadge = (status: ImportLog['status']) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
      case 'ERROR':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      case 'DUPLICATE':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Duplicate</Badge>;
      case 'SKIPPED':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Skipped</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getOrgName = (orgId: string) => {
    return organizations.find(org => org.id === orgId)?.name || orgId;
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  // Filter logs by status
  const filteredLogs = importLogs.filter(log => {
    if (logFilterStatus === 'all') return true;
    return log.status === logFilterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Link Drive Folder Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Link Organization to Drive Folder
          </CardTitle>
          <CardDescription>
            Connect an organization to its Google Drive folder for automatic report imports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Organization</label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Drive Folder URL or ID</label>
              <Input
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="e.g., https://drive.google.com/drive/folders/1a2B..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Paste full Drive link or just the folder ID
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Folder Name</label>
              <Input
                value={driveFolderName}
                onChange={(e) => setDriveFolderName(e.target.value)}
                placeholder="e.g., Artist Name"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="text-sm font-medium mb-2 block">Тип податку (опціонально)</label>
            <Select value={taxDeductionType} onValueChange={setTaxDeductionType}>
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue placeholder="Без податку" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без податку</SelectItem>
                <SelectItem value="fop_7">7% ФОП (фізична особа-підприємець)</SelectItem>
                <SelectItem value="agent_23">23% податковий агент для фіз. осіб</SelectItem>
                <SelectItem value="both">Обидва (7% ФОП + 23% агент = подвійне оподаткування)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Податок буде автоматично вираховуватись при імпорті звітів з цієї папки
            </p>
          </div>

          <Button 
            onClick={handleSetFolder} 
            disabled={setFolderMutation.isPending}
            className="w-full md:w-auto"
          >
            {setFolderMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <FolderOpen className="w-4 h-4 mr-2" />
                Link Folder
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Unlinked Organizations Scanner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Знайти непрів'язані організації
          </CardTitle>
          <CardDescription>
            Сканує папку звітів на Google Drive та знаходить організації, для яких є папка зі звітами, але прив'язку ще не зроблено
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => refetchUnlinked()}
            disabled={unlinkedLoading}
            variant="outline"
          >
            {unlinkedLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сканування...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Сканувати Drive
              </>
            )}
          </Button>

          {unlinkedOrgsData && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Папок на Drive: <strong className="text-foreground">{unlinkedOrgsData.totalDriveFolders}</strong></span>
                <span>Організацій: <strong className="text-foreground">{unlinkedOrgsData.totalOrganizations}</strong></span>
                <span>Вже прив'язано: <strong className="text-foreground">{unlinkedOrgsData.totalLinked}</strong></span>
                <span>Знайдено збігів: <strong className="text-foreground">{unlinkedOrgsData.unlinkedMatches.length}</strong></span>
              </div>

              {unlinkedOrgsData.unlinkedMatches.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-green-500" />
                  Усі організації з папками вже прив'язані
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Організація</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Папка на Drive</TableHead>
                      <TableHead>Податок</TableHead>
                      <TableHead className="text-right">Дія</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unlinkedOrgsData.unlinkedMatches.map((match) => (
                      <TableRow key={match.orgId}>
                        <TableCell className="font-medium">{match.orgName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{match.orgType}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{match.driveFolderName}</TableCell>
                        <TableCell>
                          <Select
                            value={unlinkedTaxMap[match.orgId] || 'none'}
                            onValueChange={(val) => setUnlinkedTaxMap(prev => ({ ...prev, [match.orgId]: val }))}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <SelectValue placeholder="Без податку" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Без податку</SelectItem>
                              <SelectItem value="fop_7">7% ФОП</SelectItem>
                              <SelectItem value="agent_23">23% агент</SelectItem>
                              <SelectItem value="both">7% + 23%</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              setLinkingOrgId(match.orgId);
                              quickLinkMutation.mutate(match);
                            }}
                            disabled={linkingOrgId === match.orgId}
                          >
                            {linkingOrgId === match.orgId ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <LinkIcon className="w-3 h-3 mr-1" />
                                Прив'язати
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Import Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5" />
            Manual Import
          </CardTitle>
          <CardDescription>
            Trigger the import job manually for testing (normally runs automatically on schedule)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => triggerImportMutation.mutate()} 
            disabled={triggerImportMutation.isPending}
            variant="secondary"
          >
            {triggerImportMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Run Import Now
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Import Checkpoints / History */}
      <Collapsible>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Історія імпортів (Checkpoints)
                  {checkpoints.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {checkpoints.length}
                    </Badge>
                  )}
                </CardTitle>
                <ChevronDown className="h-5 w-5" />
              </Button>
            </CollapsibleTrigger>
            <CardDescription>
              Checkpoint створюється автоматично перед кожним імпортом. Ви можете відкотитися до будь-якого checkpoint.
            </CardDescription>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {checkpointsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : checkpoints.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Немає checkpoints. Вони створюються автоматично при натисканні "Run Import Now".</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата/Час</TableHead>
                        <TableHead>Опис</TableHead>
                        <TableHead>Звітів на момент</TableHead>
                        <TableHead>Створив</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="text-right">Дії</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkpoints.map((checkpoint) => (
                        <TableRow key={checkpoint.id}>
                          <TableCell className="font-medium">
                            {new Date(checkpoint.createdAt).toLocaleString('uk-UA', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>{checkpoint.description || '—'}</TableCell>
                          <TableCell>{checkpoint.lastReportCount}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {checkpoint.creatorEmail || checkpoint.createdBy}
                          </TableCell>
                          <TableCell>
                            {checkpoint.status === 'ROLLED_BACK' ? (
                              <Badge variant="outline" className="text-orange-500 border-orange-500">
                                Відкочено
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-500 border-green-500">
                                Активний
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {checkpoint.status === 'ACTIVE' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCheckSafety(checkpoint)}
                                className="text-orange-500 hover:text-orange-600"
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                Відкотитися
                              </Button>
                            )}
                            {checkpoint.status === 'ROLLED_BACK' && checkpoint.rolledBackAt && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(checkpoint.rolledBackAt).toLocaleString('uk-UA', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Linked Folders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Linked Drive Folders
          </CardTitle>
          <CardDescription>
            Organizations currently linked to Google Drive folders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {foldersLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : driveFolders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No Drive folders linked yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Folder Name</TableHead>
                    <TableHead>Last Synced</TableHead>
                    <TableHead>Last Import Attempt</TableHead>
                    <TableHead>Last Success</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driveFolders.map((folder) => (
                    <TableRow key={folder.id}>
                      <TableCell className="font-medium">{getOrgName(folder.orgId)}</TableCell>
                      <TableCell>{folder.driveFolderName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(folder.lastSyncedAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(folder.lastImportAttemptAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(folder.lastSuccessfulImportAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => triggerOrgImportMutation.mutate(folder.orgId)}
                            disabled={importingOrgId === folder.orgId || triggerOrgImportMutation.isPending}
                            title="Import reports for this organization"
                          >
                            {importingOrgId === folder.orgId ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFolder(folder.orgId)}
                            disabled={removeFolderMutation.isPending}
                            title="Remove folder link"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Logs
          </CardTitle>
          <CardDescription>
            Recent automatic import attempts and their results (showing up to 100 most recent)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="w-64">
              <label className="text-sm font-medium mb-2 block">Filter by Organization</label>
              <Select value={logFilterOrg} onValueChange={setLogFilterOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="All organizations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organizations</SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-64">
              <label className="text-sm font-medium mb-2 block">Filter by Status</label>
              <Select value={logFilterStatus} onValueChange={setLogFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="DUPLICATE">Duplicate</SelectItem>
                  <SelectItem value="SKIPPED">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {logsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : importLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No import logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No logs match the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.slice(0, 100).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(log.importedAt)}
                      </TableCell>
                      <TableCell>{getOrgName(log.orgId)}</TableCell>
                      <TableCell className="font-mono text-sm">{log.driveFileName || 'N/A'}</TableCell>
                      <TableCell>{log.reportPeriod || 'N/A'}</TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {log.errorMessage || '-'}
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setOrgToDelete(''); // Clear on close
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Drive Folder Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink the Google Drive folder from the organization. 
              Automatic imports will stop for this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback Confirmation Dialog */}
      <AlertDialog open={rollbackDialogOpen} onOpenChange={(open) => {
        setRollbackDialogOpen(open);
        if (!open) {
          setCheckpointToRollback(null);
          setSafetyCheck(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Підтвердження відкату
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {checkpointToRollback && (
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm">
                      <strong>Checkpoint:</strong>{' '}
                      {new Date(checkpointToRollback.createdAt).toLocaleString('uk-UA')}
                    </p>
                    <p className="text-sm">
                      <strong>Опис:</strong> {checkpointToRollback.description || '—'}
                    </p>
                    <p className="text-sm">
                      <strong>Звітів на той момент:</strong> {checkpointToRollback.lastReportCount}
                    </p>
                  </div>
                )}

                {checkingSafety ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Перевіряємо безпеку відкату...
                  </div>
                ) : safetyCheck ? (
                  <div className={`p-3 rounded-md ${safetyCheck.safe ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    {safetyCheck.safe ? (
                      <>
                        <p className="text-sm text-green-600 font-medium">
                          ✓ Відкат безпечний
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Буде видалено {safetyCheck.affectedReports} звіт(ів), імпортованих після цього checkpoint.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-red-600 font-medium">
                          ✗ Відкат неможливий
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {safetyCheck.reason}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}

                <p className="text-sm text-muted-foreground">
                  Ця дія видалить всі звіти, імпортовані після вибраного checkpoint, 
                  включно з пов'язаними даними (rows, allocations, summaries).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => checkpointToRollback && rollbackMutation.mutate(checkpointToRollback.id)}
              disabled={!safetyCheck?.safe || rollbackMutation.isPending}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {rollbackMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Виконуємо...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Відкотитися
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
