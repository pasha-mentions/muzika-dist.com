import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, Loader2, Calendar, Trash2, RefreshCw, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DriveImportManagement from './drive-import-management';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Organization {
  id: string;
  name: string;
  type: string;
}

interface StreamingReport {
  id: string;
  orgId: string;
  uploadedBy: string;
  period: string;
  fileName: string;
  totalStreams: number;
  totalRevenue: string;
  currency: string;
  eurToUahRate: string | null;
  createdAt: string;
  organization?: {
    name: string;
  };
}

export default function ReportsUploadTab() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [period, setPeriod] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [applyTax, setApplyTax] = useState(false);
  const [taxDeductionType, setTaxDeductionType] = useState<string>('fop_7');

  // Fetch all organizations
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  // Upload report mutation
  const uploadReportMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/admin/streaming-reports', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to upload report';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            errorMessage = error.message || error.error || errorMessage;
            if (error.details) {
              errorMessage += ` (${error.details})`;
            }
          } else {
            const text = await response.text();
            console.error('Non-JSON error response:', text);
            errorMessage = `Server error (${response.status}): ${response.statusText}`;
          }
        } catch (parseError) {
          console.error('Error parsing error response:', parseError);
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Report uploaded successfully',
      });
      // Reset form
      setFile(null);
      setPeriod('');
      setSelectedOrgId('');
      // Invalidate all streaming reports caches (admin panel + user Reports page)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleUpload = async () => {
    if (!selectedOrgId || !period || !file) {
      toast({
        title: 'Error',
        description: 'Please select organization, period, and file',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('orgId', selectedOrgId);
    formData.append('period', period);
    if (applyTax) {
      formData.append('taxDeductionType', taxDeductionType);
    }

    setIsUploading(true);
    try {
      await uploadReportMutation.mutateAsync(formData);
    } finally {
      setIsUploading(false);
    }
  };

  const validateExcelFile = (file: File): { isValid: boolean; error?: string } => {
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidExtension) {
      return { isValid: false, error: 'Only .xlsx and .xls files are allowed' };
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { isValid: false, error: 'File size must be less than 10MB' };
    }

    return { isValid: true };
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      const validation = validateExcelFile(droppedFile);

      if (!validation.isValid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }

      setFile(droppedFile);
      toast({
        title: 'File Selected',
        description: `${droppedFile.name} is ready to upload`,
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validation = validateExcelFile(selectedFile);
      if (!validation.isValid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="single">{t('admin.reports.singleUpload')}</TabsTrigger>
          <TabsTrigger value="bulk">{t('admin.reports.bulkUpload')}</TabsTrigger>
          <TabsTrigger value="drive-import">Drive Auto-Import</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                {t('admin.reports.uploadSingleReport')}
              </h3>

              <div className="space-y-4">
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
              <label className="text-sm font-medium mb-2 block">Period (e.g., 04/2025)</label>
              <Input
                type="text"
                placeholder="04/2025"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Excel File</label>
              
              {/* Drag & Drop Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 transition-all duration-200
                  ${isDragging 
                    ? 'border-purple-500 bg-purple-500/10 scale-[1.02]' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500'
                  }
                `}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="file-upload"
                />
                
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center justify-center gap-3"
                >
                  <div className={`
                    p-4 rounded-full transition-colors
                    ${isDragging ? 'bg-purple-500/20' : 'bg-gray-100 dark:bg-gray-800'}
                  `}>
                    <FileSpreadsheet className={`
                      w-10 h-10 transition-colors
                      ${isDragging ? 'text-purple-500' : 'text-gray-400'}
                    `} />
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      {isDragging ? 'Drop your Excel file here' : 'Drag & drop your Excel file here'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      or click to browse (.xlsx, .xls up to 10MB)
                    </p>
                  </div>
                </label>
              </div>

              {/* Selected File Display */}
              {file && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                    className="h-8 w-8 p-0"
                  >
                    ×
                  </Button>
                </div>
              )}
            </div>

            {/* Tax Configuration */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="apply-tax" 
                  checked={applyTax} 
                  onCheckedChange={(checked) => setApplyTax(checked === true)}
                />
                <Label 
                  htmlFor="apply-tax" 
                  className="text-sm font-medium cursor-pointer"
                >
                  Вирахувати податок?
                </Label>
              </div>
              
              {applyTax && (
                <div>
                  <Label className="text-sm mb-2 block">Тип податку</Label>
                  <Select value={taxDeductionType} onValueChange={setTaxDeductionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fop_7">7% ФОП (фізична особа-підприємець)</SelectItem>
                      <SelectItem value="agent_23">23% податковий агент для фіз. осіб</SelectItem>
                      <SelectItem value="both">Обидва (7% ФОП + 23% агент = подвійне оподаткування)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Button
              onClick={handleUpload}
              disabled={!selectedOrgId || !period || !file || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Report
                </>
              )}
            </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="mt-6">
          <BulkReportsUpload organizations={organizations} />
        </TabsContent>

        <TabsContent value="drive-import" className="mt-6">
          <DriveImportManagement />
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Uploaded Reports</h3>
        <ReportsListAdmin />
      </div>
    </div>
  );
}

function BulkReportsUpload({ organizations }: { organizations: Organization[] }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [fromPeriod, setFromPeriod] = useState<{ month: number; year: number }>({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [toPeriod, setToPeriod] = useState<{ month: number; year: number }>({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [files, setFiles] = useState<Record<string, File>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [applyTax, setApplyTax] = useState(false);
  const [taxDeductionType, setTaxDeductionType] = useState<string>('fop_7');

  const months = [
    { value: 1, label: 'Jan' },
    { value: 2, label: 'Feb' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Apr' },
    { value: 5, label: 'May' },
    { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' },
    { value: 8, label: 'Aug' },
    { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' },
    { value: 11, label: 'Nov' },
    { value: 12, label: 'Dec' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Generate list of periods between from and to
  const generatePeriodsList = (): string[] => {
    const periods: string[] = [];
    let current = new Date(fromPeriod.year, fromPeriod.month - 1, 1);
    const end = new Date(toPeriod.year, toPeriod.month - 1, 1);

    while (current <= end) {
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      const year = current.getFullYear();
      periods.push(`${month}/${year}`);
      current.setMonth(current.getMonth() + 1);
    }

    return periods;
  };

  const periods = generatePeriodsList();

  const validateExcelFile = (file: File): { isValid: boolean; error?: string } => {
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidExtension) {
      return { isValid: false, error: 'Only .xlsx and .xls files are allowed' };
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { isValid: false, error: 'File size must be less than 10MB' };
    }

    return { isValid: true };
  };

  const handleFileSelect = (period: string, file: File | null) => {
    if (file) {
      const validation = validateExcelFile(file);
      if (!validation.isValid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
      setFiles(prev => ({ ...prev, [period]: file }));
    } else {
      setFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[period];
        return newFiles;
      });
    }
  };

  const handleUploadAll = async () => {
    if (!selectedOrgId) {
      toast({
        title: 'Error',
        description: t('admin.reports.selectOrganization'),
        variant: 'destructive',
      });
      return;
    }

    const filledPeriods = periods.filter(p => files[p]);
    if (filledPeriods.length === 0) {
      toast({
        title: 'Error',
        description: t('admin.reports.selectOneFile'),
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: filledPeriods.length });

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < filledPeriods.length; i++) {
      const period = filledPeriods[i];
      const file = files[period];

      setUploadProgress({ current: i + 1, total: filledPeriods.length });

      try {
        const formData = new FormData();
        formData.append('orgId', selectedOrgId);
        formData.append('period', period);
        formData.append('file', file);
        if (applyTax) {
          formData.append('taxDeductionType', taxDeductionType);
        }

        const response = await fetch('/api/admin/streaming-reports', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          let errorMessage = 'Failed to upload report';
          try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const error = await response.json();
              errorMessage = error.message || error.error || errorMessage;
            }
          } catch (e) {
            errorMessage = `Server error (${response.status})`;
          }
          throw new Error(errorMessage);
        }

        successCount++;
      } catch (error: any) {
        errorCount++;
        errors.push(`${period}: ${error.message}`);
      }
    }

    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });

    // Show results
    if (successCount > 0) {
      toast({
        title: t('admin.reports.uploadComplete'),
        description: t('admin.reports.successfullyUploaded', { 
          count: successCount, 
          failed: errorCount > 0 ? t('admin.reports.failed', { count: errorCount }) : ''
        }),
      });

      // Reset form if all succeeded
      if (errorCount === 0) {
        setFiles({});
        setSelectedOrgId('');
      }

      // Invalidate caches
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
    }

    if (errorCount > 0) {
      toast({
        title: t('admin.reports.uploadErrors'),
        description: errors.join('; '),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          {t('admin.reports.bulkUploadReports')}
        </h3>

        <div className="space-y-6">
          {/* Organization Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('admin.reports.organization')}</label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder={t('admin.reports.selectOrgPlaceholder')} />
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

          {/* Tax Configuration */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="bulk-apply-tax" 
                checked={applyTax} 
                onCheckedChange={(checked) => setApplyTax(checked === true)}
              />
              <Label 
                htmlFor="bulk-apply-tax" 
                className="text-sm font-medium cursor-pointer"
              >
                Вирахувати податок?
              </Label>
            </div>
            
            {applyTax && (
              <div>
                <Label className="text-sm mb-2 block">Тип податку</Label>
                <Select value={taxDeductionType} onValueChange={setTaxDeductionType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fop_7">7% ФОП (фізична особа-підприємець)</SelectItem>
                    <SelectItem value="agent_23">23% податковий агент для фіз. осіб</SelectItem>
                    <SelectItem value="both">Обидва (7% ФОП + 23% агент = подвійне оподаткування)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Period Range Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.reports.fromPeriod')}</label>
              <div className="flex gap-2">
                <Select 
                  value={fromPeriod.month.toString()} 
                  onValueChange={(val) => setFromPeriod(prev => ({ ...prev, month: parseInt(val) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(month => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select 
                  value={fromPeriod.year.toString()} 
                  onValueChange={(val) => setFromPeriod(prev => ({ ...prev, year: parseInt(val) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t('admin.reports.toPeriod')}</label>
              <div className="flex gap-2">
                <Select 
                  value={toPeriod.month.toString()} 
                  onValueChange={(val) => setToPeriod(prev => ({ ...prev, month: parseInt(val) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(month => (
                      <SelectItem key={month.value} value={month.value.toString()}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select 
                  value={toPeriod.year.toString()} 
                  onValueChange={(val) => setToPeriod(prev => ({ ...prev, year: parseInt(val) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Dynamic File Upload Fields */}
          {periods.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium block">
                {t('admin.reports.uploadReports')} ({t('admin.reports.periodsCount', { count: periods.length, plural: periods.length > 1 ? 's' : '' })})
              </label>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {periods.map((period) => (
                  <PeriodFileUpload
                    key={period}
                    period={period}
                    file={files[period] || null}
                    onFileSelect={(file) => handleFileSelect(period, file)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">
                  {t('admin.reports.uploadingProgress')} {uploadProgress.current} / {uploadProgress.total}...
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUploadAll}
            disabled={!selectedOrgId || Object.keys(files).length === 0 || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('admin.reports.uploadingProgress')} {uploadProgress.current}/{uploadProgress.total}...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {t('admin.reports.uploadAllReports')} ({Object.keys(files).length})
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PeriodFileUpload({ 
  period, 
  file, 
  onFileSelect 
}: { 
  period: string; 
  file: File | null; 
  onFileSelect: (file: File | null) => void;
}) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        border rounded-lg p-3 transition-all duration-200
        ${isDragging 
          ? 'border-purple-500 bg-purple-500/10' 
          : 'border-gray-200 dark:border-gray-700 hover:border-purple-400'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">{period}</span>
        </div>

        {file ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FileSpreadsheet className="w-4 h-4 text-purple-500 flex-shrink-0" />
            <span className="text-sm truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFileSelect(null)}
              className="h-7 w-7 p-0 flex-shrink-0"
            >
              ×
            </Button>
          </div>
        ) : (
          <div className="flex-1">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileInputChange}
              className="hidden"
              id={`file-${period}`}
            />
            <label
              htmlFor={`file-${period}`}
              className="cursor-pointer text-sm text-purple-500 hover:text-purple-600 transition-colors"
            >
              {t('admin.reports.chooseFile')}
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportsListAdmin() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<StreamingReport | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacePeriod, setReplacePeriod] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [replaceApplyTax, setReplaceApplyTax] = useState(false);
  const [replaceTaxDeductionType, setReplaceTaxDeductionType] = useState<string>('fop_7');

  const { data: reports = [], isLoading } = useQuery<StreamingReport[]>({
    queryKey: ['/api/admin/streaming-reports'],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const response = await fetch(`/api/admin/streaming-reports/${reportId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete report');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.reports.deleteSuccess', 'Report deleted successfully'),
      });
      // Invalidate all streaming reports caches (admin panel + user Reports page)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
      setDeleteDialogOpen(false);
      setSelectedReport(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Replace mutation
  const replaceMutation = useMutation({
    mutationFn: async ({ reportId, formData }: { reportId: string; formData: FormData }) => {
      const response = await fetch(`/api/admin/streaming-reports/${reportId}`, {
        method: 'PUT',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to replace report');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.reports.replaceSuccess', 'Report replaced successfully'),
      });
      // Invalidate all streaming reports caches (admin panel + user Reports page)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
      setReplaceDialogOpen(false);
      setSelectedReport(null);
      setReplaceFile(null);
      setReplacePeriod('');
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fix data mutation - track which report is being fixed
  const [fixingReportId, setFixingReportId] = useState<string | null>(null);
  
  const fixDataMutation = useMutation({
    mutationFn: async (reportId: string) => {
      setFixingReportId(reportId);
      const response = await fetch(`/api/admin/streaming-reports/${reportId}/fix-data`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fix report data');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: `Fixed data successfully. New total revenue: €${data.totalRevenue}`,
      });
      setFixingReportId(null);
      // Invalidate all streaming reports caches (admin panel + user Reports page)
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setFixingReportId(null);
    },
  });

  const handleDelete = (report: StreamingReport) => {
    setSelectedReport(report);
    setDeleteDialogOpen(true);
  };

  const handleReplace = (report: StreamingReport) => {
    setSelectedReport(report);
    setReplacePeriod(report.period);
    setReplaceDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedReport) {
      deleteMutation.mutate(selectedReport.id);
    }
  };

  const confirmReplace = () => {
    if (selectedReport && replaceFile) {
      const formData = new FormData();
      formData.append('file', replaceFile);
      formData.append('period', replacePeriod);
      if (replaceApplyTax) {
        formData.append('taxDeductionType', replaceTaxDeductionType);
      }
      replaceMutation.mutate({ reportId: selectedReport.id, formData });
    }
  };

  const validateExcelFile = (file: File): { isValid: boolean; error?: string } => {
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidExtension) {
      return { isValid: false, error: 'Only .xlsx and .xls files are allowed' };
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { isValid: false, error: 'File size must be less than 10MB' };
    }

    return { isValid: true };
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      const validation = validateExcelFile(droppedFile);

      if (!validation.isValid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }

      setReplaceFile(droppedFile);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validation = validateExcelFile(selectedFile);
      if (!validation.isValid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
      setReplaceFile(selectedFile);
    }
  };

  const handleFixAllReports = async () => {
    setIsFixingAll(true);
    try {
      const response = await fetch('/api/admin/streaming-reports/fix-all-data', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fix reports');
      }
      
      const data = await response.json();
      toast({
        title: 'Success',
        description: `Fixed ${data.totalRowsFixed} rows across ${data.totalReportsFixed} reports`,
      });
      
      // Invalidate caches
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && 
                 (key.startsWith('/api/admin/streaming-reports') || 
                  key.startsWith('/api/streaming-reports'));
        }
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsFixingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">No reports uploaded yet</p>
    );
  }

  return (
    <>
      {/* Fix All Button */}
      <div className="mb-4 flex justify-end">
        <Button
          onClick={handleFixAllReports}
          disabled={isFixingAll}
          className="gap-2 bg-blue-600 hover:bg-blue-700"
        >
          {isFixingAll ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Fixing all reports...
            </>
          ) : (
            <>
              <Wrench className="w-4 h-4" />
              Fix All Reports
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-4">
        {reports.map((report) => (
          <Card key={report.id}>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="w-5 h-5 text-purple-500 flex-shrink-0" />
                    <h4 className="font-semibold truncate" title={report.fileName}>{report.fileName}</h4>
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    Organization: {report.organization?.name || 'Unknown'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {report.period}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {report.totalStreams.toLocaleString()} streams
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {parseFloat(report.totalRevenue).toFixed(2)} {report.currency}
                    </Badge>
                    {report.eurToUahRate && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                        {(parseFloat(report.totalRevenue) * parseFloat(report.eurToUahRate)).toFixed(2)} ₴
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:flex-nowrap md:ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fixDataMutation.mutate(report.id)}
                    disabled={fixingReportId === report.id}
                    className="gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50"
                  >
                    {fixingReportId === report.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Fix</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReplace(report)}
                    className="gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('admin.reports.replace', 'Replace')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(report)}
                    className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('admin.reports.delete', 'Delete')}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.reports.deleteTitle', 'Delete Report')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.reports.deleteDescription', 'Are you sure you want to delete this report? This action cannot be undone and will remove all associated data.')}
              {selectedReport && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="font-medium">{selectedReport.fileName}</p>
                  <p className="text-sm text-muted-foreground">{selectedReport.period}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.deleting', 'Deleting...')}
                </>
              ) : (
                t('common.delete', 'Delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace Report Dialog */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('admin.reports.replaceTitle', 'Replace Report')}</DialogTitle>
            <DialogDescription>
              {t('admin.reports.replaceDescription', 'Upload a new file to replace the existing report data.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('admin.reports.period', 'Period')}
              </label>
              <Input
                type="text"
                placeholder="04/2025"
                value={replacePeriod}
                onChange={(e) => setReplacePeriod(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('admin.reports.newFile', 'New Excel File')}
              </label>
              <div
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDragging(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-lg p-6 transition-all
                  ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-gray-300'}
                `}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="replace-file-upload"
                />
                <label
                  htmlFor="replace-file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <FileSpreadsheet className="w-8 h-8 text-purple-500" />
                  <p className="text-sm text-center">
                    {isDragging ? 'Drop file here' : 'Drag & drop or click to browse'}
                  </p>
                </label>
              </div>
              {replaceFile && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-purple-500" />
                  <p className="text-sm flex-1 truncate">{replaceFile.name}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplaceFile(null)}
                    className="h-8 w-8 p-0"
                  >
                    ×
                  </Button>
                </div>
              )}
            </div>

            {/* Tax Configuration */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="replace-apply-tax" 
                  checked={replaceApplyTax} 
                  onCheckedChange={(checked) => setReplaceApplyTax(checked === true)}
                />
                <Label 
                  htmlFor="replace-apply-tax" 
                  className="text-sm font-medium cursor-pointer"
                >
                  Вирахувати податок?
                </Label>
              </div>
              
              {replaceApplyTax && (
                <div>
                  <Label className="text-sm mb-2 block">Тип податку</Label>
                  <Select value={replaceTaxDeductionType} onValueChange={setReplaceTaxDeductionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fop_7">7% ФОП (фізична особа-підприємець)</SelectItem>
                      <SelectItem value="agent_23">23% податковий агент для фіз. осіб</SelectItem>
                      <SelectItem value="both">Обидва (7% ФОП + 23% агент = подвійне оподаткування)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceDialogOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={confirmReplace}
              disabled={!replaceFile || !replacePeriod || replaceMutation.isPending}
            >
              {replaceMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common.replacing', 'Replacing...')}
                </>
              ) : (
                t('admin.reports.replace', 'Replace')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
