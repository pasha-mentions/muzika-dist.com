export interface ReleaseFormData {
  title: string;
  artistId: string;
  type: "SINGLE" | "EP" | "ALBUM";
  primaryGenre: string;
  releaseDate: Date | null;
  upc: string;
  labelName: string;
  pCopyright: string;
  territories: string[];
  rightsOwner: string;
  tracks: TrackFormData[];
  artworkUrl: string;
  artworkFileId?: string;
  splits: SplitFormData[];
  artists: ArtistFormData[];
}

export interface ArtistFormData {
  id: string;
  name: string;
  role: "MAIN" | "FEATURED";
}

export interface TrackFormData {
  id: string;
  title: string;
  isrc?: string;
  trackIndex: number;
  explicit: boolean;
  audioUrl?: string;
  audioFileId?: string;
  version?: string;
  duration?: number;
  participants?: any;
}

export interface SplitFormData {
  id: string;
  email: string;
  percent: number;
  role?: string;
}

export interface FileUploadResult {
  uploadUrl: string;
  downloadUrl: string;
  fields: Record<string, string>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface QCItem {
  id: string;
  severity: "INFO" | "WARN" | "ERROR";
  message: string;
  resolved: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: "ARTIST" | "LABEL" | "TEAM" | "ADMIN";
  platformRole?: "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "PLATFORM_FINANCIER" | null;
  organizations: Organization[];
}

export interface Organization {
  id: string;
  name: string;
  type: "ARTIST_ORG" | "LABEL";
  status?: "STANDARD" | "AMBASSADOR" | "TEST";
  planType: "FREE" | "PRO";
  monthlyReleaseLimit: number;
  balance: number;
}

export interface RevenueData {
  totalRevenue: number;
  totalStreams: number;
  avgPerStream: number;
  reportRows: ReportRow[];
}

export interface ReportRow {
  id: string;
  period: string;
  source: string;
  territory: string;
  upc?: string;
  isrc?: string;
  units: number;
  revenueCents: number;
}

export interface Stats {
  totalRevenue: number;
  activeReleases: number;
  totalStreams: number;
  pendingReview: number;
}
