import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, User as UserIcon, Shield, Copy, CheckCircle2, Search, Edit, Mail, Users, Building2, UserX, Link2, Percent, CreditCard, Music } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { countries } from "@shared/countries";
import { LocalPlaylistsManager } from "./local-playlists-manager";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  platformRole?: string | null;
  createdAt: string;
  organizations?: Array<{
    id: string;
    name: string;
    type: string;
    status?: string;
  }>;
}

interface Organization {
  id: string;
  name: string;
  type: "ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR";
  status: "STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50";
  isFrozen: boolean;
  createdAt: string;
  memberCount?: number;
  hasOrphanedMembers?: boolean;
  freeReleases?: boolean;
}

interface OrgMember {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: User;
}

interface LabelArtistLink {
  id: string;
  labelOrgId: string;
  artistOrgId: string;
  revenueSharePercent: number;
  labelPaysReleases: boolean;
  fixedReleaseFee: number | null;
  status: "ACTIVE" | "INACTIVE";
  notes: string | null;
  createdAt: string;
  labelOrg: { id: string; name: string; type: string };
  artistOrg: { id: string; name: string; type: string };
}

export default function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Helper to get cached members for an org
  const getCachedMembers = (orgId: string): OrgMember[] => {
    return queryClient.getQueryData<OrgMember[]>([`/api/admin/organizations/${orgId}/members`]) || [];
  };
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newRole, setNewRole] = useState<"ARTIST" | "LABEL" | "TEAM" | "ADMIN">("ARTIST");
  const [newCountry, setNewCountry] = useState("UA");
  const [newOrgType, setNewOrgType] = useState<"ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR">("ARTIST_ORG");
  const [newOrgStatus, setNewOrgStatus] = useState<"STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50">("STANDARD");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdUserEmail, setCreatedUserEmail] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  
  // Search states
  const [organizationsSearch, setOrganizationsSearch] = useState("");
  const [orgMembersSearch, setOrgMembersSearch] = useState("");
  
  // Organization filter states
  const [orgTypeFilter, setOrgTypeFilter] = useState<"all" | "ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR">("all");
  const [orgStatusFilter, setOrgStatusFilter] = useState<"all" | "STANDARD" | "AMBASSADOR" | "MILITARY" | "DISCOUNT_50">("all");
  const [orgFrozenFilter, setOrgFrozenFilter] = useState(false);
  const [orgFreeFilter, setOrgFreeFilter] = useState(false);
  
  // Edit user dialog state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCountry, setEditCountry] = useState("UA");
  const [editOrgId, setEditOrgId] = useState("");
  const [editOrgRole, setEditOrgRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  
  // Email dialog state
  const [selectedUserForEmail, setSelectedUserForEmail] = useState<User | null>(null);
  const [emailMessage, setEmailMessage] = useState("");

  // Organization management state
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [addMemberOrgId, setAddMemberOrgId] = useState<string | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [memberToDelete, setMemberToDelete] = useState<{ memberId: string; userName: string; orgName: string } | null>(null);
  const [orgToDelete, setOrgToDelete] = useState<{ orgId: string; orgName: string } | null>(null);

  // Edit organization dialog state
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgEditName, setOrgEditName] = useState("");
  const [orgEditType, setOrgEditType] = useState<"ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR">("ARTIST_ORG");
  const [orgEditStatus, setOrgEditStatus] = useState<"STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50">("STANDARD");
  const [orgEditFrozen, setOrgEditFrozen] = useState(false);
  const [orgEditFreeReleases, setOrgEditFreeReleases] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Platform admin creation dialog state
  const [showPlatformAdminDialog, setShowPlatformAdminDialog] = useState(false);
  const [platformAdminEmail, setPlatformAdminEmail] = useState("");
  const [platformAdminFirstName, setPlatformAdminFirstName] = useState("");
  const [platformAdminLastName, setPlatformAdminLastName] = useState("");
  const [platformAdminCountry, setPlatformAdminCountry] = useState("UA");
  const [platformAdminRole, setPlatformAdminRole] = useState<"PLATFORM_OWNER" | "PLATFORM_ADMIN" | "PLATFORM_FINANCIER">("PLATFORM_ADMIN");

  // Add member to organization state
  const [memberOrgId, setMemberOrgId] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberFirstName, setMemberFirstName] = useState("");
  const [memberLastName, setMemberLastName] = useState("");
  const [memberCountry, setMemberCountry] = useState("UA");
  const [memberOrgRole, setMemberOrgRole] = useState<"ADMIN" | "MEMBER">("MEMBER");

  // Labels tab state
  const [labelsSearch, setLabelsSearch] = useState("");
  const [newLinkLabelId, setNewLinkLabelId] = useState("");
  const [newLinkArtistId, setNewLinkArtistId] = useState("");
  const [newLinkRevenueShare, setNewLinkRevenueShare] = useState("0");
  const [newLinkLabelPays, setNewLinkLabelPays] = useState(true);
  const [newLinkFee, setNewLinkFee] = useState("");
  const [newLinkNotes, setNewLinkNotes] = useState("");
  const [editingLink, setEditingLink] = useState<LabelArtistLink | null>(null);
  const [editLinkRevenueShare, setEditLinkRevenueShare] = useState("0");
  const [editLinkLabelPays, setEditLinkLabelPays] = useState(true);
  const [editLinkFee, setEditLinkFee] = useState("");
  const [editLinkStatus, setEditLinkStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [editLinkNotes, setEditLinkNotes] = useState("");
  const [linkToDelete, setLinkToDelete] = useState<{ id: string; labelName: string; artistName: string } | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    retry: false,
  });

  const { data: organizations = [], isLoading: isLoadingOrgs } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    retry: false,
  });

  const { data: labelArtistLinks = [], isLoading: isLoadingLinks } = useQuery<LabelArtistLink[]>({
    queryKey: ["/api/admin/label-links"],
    retry: false,
  });

  // Filter label-artist links based on search
  const filteredLabelLinks = labelArtistLinks.filter((link) => {
    const searchLower = labelsSearch.toLowerCase();
    return (
      (link.labelOrg?.name?.toLowerCase() || "").includes(searchLower) ||
      (link.artistOrg?.name?.toLowerCase() || "").includes(searchLower)
    );
  });

  // Get labels and artists for selects
  const labelOrganizations = organizations.filter(org => org.type === "LABEL");
  const artistOrganizations = organizations.filter(org => org.type === "ARTIST_ORG");

  // Show ALL organizations (no filtering by user membership - allows seeing orphaned orgs)
  const clientOrganizations = organizations;

  // Filter organizations based on search and filters
  const filteredOrganizations = clientOrganizations.filter((org) => {
    const matchesSearch = org.name.toLowerCase().includes(organizationsSearch.toLowerCase());
    const matchesType = orgTypeFilter === "all" || org.type === orgTypeFilter;
    const matchesStatus = orgStatusFilter === "all" || org.status === orgStatusFilter;
    const matchesFrozen = !orgFrozenFilter || org.isFrozen === true;
    const matchesFree = !orgFreeFilter || org.freeReleases === true;
    return matchesSearch && matchesType && matchesStatus && matchesFrozen && matchesFree;
  });

  // Filter org members based on search
  const filteredOrgMembers = users.filter((user) => {
    // Exclude platform administrators
    if (user.platformRole) return false;
    
    const matchesSearch = 
      (user.firstName || "").toLowerCase().includes(orgMembersSearch.toLowerCase()) ||
      (user.lastName || "").toLowerCase().includes(orgMembersSearch.toLowerCase()) ||
      user.email.toLowerCase().includes(orgMembersSearch.toLowerCase()) ||
      user.organizations?.some(org => org.name.toLowerCase().includes(orgMembersSearch.toLowerCase()));
    
    return matchesSearch;
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { 
      email: string; 
      role: string; 
      firstName: string; 
      lastName: string; 
      organizationName: string; 
      country: string;
      platformRole?: string;
      organizationType?: string;
      organizationStatus?: string;
    }) => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      
      // Save email before clearing fields (for template copying)
      const savedEmail = showPlatformAdminDialog ? platformAdminEmail : newEmail;
      setCreatedUserEmail(savedEmail);
      
      // Clear fields based on which dialog was used
      if (showPlatformAdminDialog) {
        // Platform admin creation
        setShowPlatformAdminDialog(false);
        setPlatformAdminEmail("");
        setPlatformAdminFirstName("");
        setPlatformAdminLastName("");
        setPlatformAdminCountry("UA");
        setPlatformAdminRole("PLATFORM_ADMIN");
      } else {
        // Regular user creation
        setNewEmail("");
        setNewFirstName("");
        setNewLastName("");
        setNewOrgName("");
        setNewCountry("UA");
      }
      
      setTempPassword(data.temporaryPassword);
      setShowPasswordDialog(true);
      setPasswordCopied(false);
      setTemplateCopied(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      toast({
        title: "User Deleted",
        description: "User has been successfully removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      firstName: string; 
      lastName: string; 
      country: string; 
      organizationId: string; 
      orgRole: "OWNER" | "ADMIN" | "MEMBER";
      password?: string;
      oldOrgId?: string;
      email?: string;
    }) => {
      const response = await fetch(`/api/admin/users/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          firstName: data.firstName,
          lastName: data.lastName,
          country: data.country,
          organizationId: data.organizationId,
          orgRole: data.orgRole,
          password: data.password,
          email: data.email,
        }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update user");
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Invalidate all organization and user queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      
      // Invalidate new organization members
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.organizationId}/members`] });
      
      // Invalidate old organization members if user was moved
      if (variables.oldOrgId && variables.oldOrgId !== variables.organizationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.oldOrgId}/members`] });
      }
      
      setEditingUser(null);
      toast({
        title: "User Updated",
        description: "User information has been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { userId: string; message: string }) => {
      const response = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send email");
      }
      return response.json();
    },
    onSuccess: () => {
      setSelectedUserForEmail(null);
      setEmailMessage("");
      toast({
        title: "Email Sent",
        description: "Email has been successfully sent to the user",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Organization member mutations
  const addOrgMemberMutation = useMutation({
    mutationFn: async (data: { orgId: string; userId: string; role: string }) => {
      const response = await fetch(`/api/admin/organizations/${data.orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.userId, role: data.role }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add member");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.orgId}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setAddMemberOrgId(null);
      setNewMemberUserId("");
      setNewMemberRole("MEMBER");
      toast({
        title: "Member Added",
        description: "User has been added to the organization",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (data: { orgId: string; memberId: string; role: string }) => {
      const response = await fetch(`/api/admin/organizations/${data.orgId}/members/${data.memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: data.role }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update member role");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.orgId}/members`] });
      toast({
        title: "Role Updated",
        description: "Member role has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (data: { orgId: string; memberId: string }) => {
      const response = await fetch(`/api/admin/organizations/${data.orgId}/members/${data.memberId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove member");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.orgId}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setMemberToDelete(null);
      toast({
        title: "Member Removed",
        description: "User has been removed from the organization",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await fetch(`/api/admin/organizations/${orgId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete organization");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setOrgToDelete(null);
      setEditingOrg(null);
      setShowDeleteConfirmation(false);
      toast({
        title: "Organization Deleted",
        description: "Organization and all associated data have been successfully deleted",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setOrgToDelete(null);
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; type: "ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR"; status?: "STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50"; isFrozen?: boolean; freeReleases?: boolean }) => {
      const response = await fetch(`/api/admin/organizations/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          type: data.type,
          status: data.status,
          isFrozen: data.isFrozen,
          freeReleases: data.freeReleases,
        }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update organization");
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.id}/members`] });
      setEditingOrg(null);
      toast({
        title: "Organization Updated",
        description: "Organization has been successfully updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createOrgMemberMutation = useMutation({
    mutationFn: async (data: { orgId: string; email: string; firstName: string; lastName: string; country: string; role: "ADMIN" | "MEMBER" }) => {
      const response = await fetch(`/api/admin/organizations/${data.orgId}/create-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          country: data.country,
          role: data.role,
        }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create member");
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${variables.orgId}/members`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      
      // Save email before clearing (for template copying)
      const savedEmail = memberEmail;
      
      // Clear form
      setMemberOrgId("");
      setMemberEmail("");
      setMemberFirstName("");
      setMemberLastName("");
      setMemberCountry("UA");
      setMemberOrgRole("MEMBER");
      
      // Check if this was a new user creation (has tempPassword) or existing user addition
      if (data.tempPassword) {
        // Show password dialog for new users
        setCreatedUserEmail(savedEmail);
        setTempPassword(data.tempPassword);
        setShowPasswordDialog(true);
        setPasswordCopied(false);
        setTemplateCopied(false);
        
        toast({
          title: "Member Created",
          description: "New member has been created and added to the organization",
        });
      } else {
        // Existing user was added to organization
        toast({
          title: "Member Added",
          description: "Existing user has been added to the organization",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Label-Artist Link mutations
  const createLabelLinkMutation = useMutation({
    mutationFn: async (data: { 
      labelOrgId: string; 
      artistOrgId: string; 
      revenueSharePercent: number; 
      labelPaysReleases: boolean;
      fixedReleaseFee?: number | null;
      notes?: string;
    }) => {
      const response = await fetch("/api/admin/label-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create label-artist link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/label-links"] });
      setNewLinkLabelId("");
      setNewLinkArtistId("");
      setNewLinkRevenueShare("0");
      setNewLinkLabelPays(true);
      setNewLinkFee("");
      setNewLinkNotes("");
      toast({
        title: "Link Created",
        description: "Label-artist link has been created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateLabelLinkMutation = useMutation({
    mutationFn: async (data: { 
      id: string;
      revenueSharePercent?: number; 
      labelPaysReleases?: boolean;
      fixedReleaseFee?: number | null;
      status?: "ACTIVE" | "INACTIVE";
      notes?: string;
    }) => {
      const { id, ...updateData } = data;
      const response = await fetch(`/api/admin/label-links/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update label-artist link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/label-links"] });
      setEditingLink(null);
      toast({
        title: "Link Updated",
        description: "Label-artist link has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLabelLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/label-links/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete label-artist link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/label-links"] });
      setLinkToDelete(null);
      toast({
        title: "Link Deleted",
        description: "Label-artist link has been deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateLabelLink = () => {
    if (!newLinkLabelId || !newLinkArtistId) {
      toast({
        title: "Error",
        description: "Please select both a label and an artist",
        variant: "destructive",
      });
      return;
    }

    if (newLinkLabelId === newLinkArtistId) {
      toast({
        title: "Error",
        description: "Label and Artist must be different organizations",
        variant: "destructive",
      });
      return;
    }

    const revenueShare = parseInt(newLinkRevenueShare, 10);
    if (isNaN(revenueShare) || revenueShare < 0 || revenueShare > 100) {
      toast({
        title: "Error",
        description: "Revenue share must be between 0 and 100",
        variant: "destructive",
      });
      return;
    }

    let fixedFee: number | null = null;
    if (newLinkFee.trim() !== "") {
      const parsedFee = parseFloat(newLinkFee);
      if (isNaN(parsedFee) || !isFinite(parsedFee) || parsedFee < 0) {
        toast({
          title: "Error",
          description: "Fixed release fee must be a valid non-negative number",
          variant: "destructive",
        });
        return;
      }
      fixedFee = Math.round(parsedFee * 100);
    }

    createLabelLinkMutation.mutate({
      labelOrgId: newLinkLabelId,
      artistOrgId: newLinkArtistId,
      revenueSharePercent: revenueShare,
      labelPaysReleases: newLinkLabelPays,
      fixedReleaseFee: fixedFee,
      notes: newLinkNotes || undefined,
    });
  };

  const handleUpdateLabelLink = () => {
    if (!editingLink) return;

    const revenueShare = parseInt(editLinkRevenueShare, 10);
    if (isNaN(revenueShare) || revenueShare < 0 || revenueShare > 100) {
      toast({
        title: "Error",
        description: "Revenue share must be between 0 and 100",
        variant: "destructive",
      });
      return;
    }

    let fixedFee: number | null = null;
    if (editLinkFee.trim() !== "") {
      const parsedFee = parseFloat(editLinkFee);
      if (isNaN(parsedFee) || !isFinite(parsedFee) || parsedFee < 0) {
        toast({
          title: "Error",
          description: "Fixed release fee must be a valid non-negative number",
          variant: "destructive",
        });
        return;
      }
      fixedFee = Math.round(parsedFee * 100);
    }

    updateLabelLinkMutation.mutate({
      id: editingLink.id,
      revenueSharePercent: revenueShare,
      labelPaysReleases: editLinkLabelPays,
      fixedReleaseFee: fixedFee,
      status: editLinkStatus,
      notes: editLinkNotes || undefined,
    });
  };

  const handleAddUser = () => {
    if (!newEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!newOrgName.trim()) {
      toast({
        title: "Error",
        description: "Please enter an organization name",
        variant: "destructive",
      });
      return;
    }

    const userData: any = { 
      email: newEmail, 
      role: newRole,
      firstName: newFirstName.trim() || "User",
      lastName: newLastName.trim() || "",
      country: newCountry,
      organizationName: newOrgName.trim(),
      organizationType: newOrgType,
    };

    if (newOrgType === "ARTIST_ORG" || newOrgType === "LABEL") {
      userData.organizationStatus = newOrgStatus;
    }

    addUserMutation.mutate(userData);
  };

  const copyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setPasswordCopied(true);
      toast({
        title: "Password Copied",
        description: "Temporary password copied to clipboard",
      });
    }
  };

  const copyEmailTemplate = () => {
    if (tempPassword && createdUserEmail) {
      const template = `Надаю доступ до кабінету muzika-dist.com
Логін – ${createdUserEmail}
Тимчасовий пароль, який можете змінити в налаштуваннях кабінету:

${tempPassword}`;
      navigator.clipboard.writeText(template);
      setTemplateCopied(true);
      toast({
        title: "Шаблон скопійовано",
        description: "Текст листа з логіном та паролем скопійовано в буфер обміну",
      });
    }
  };

  const handleCreatePlatformAdmin = () => {
    if (!platformAdminEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!platformAdminFirstName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a first name",
        variant: "destructive",
      });
      return;
    }

    if (!platformAdminLastName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a last name",
        variant: "destructive",
      });
      return;
    }

    const userData = {
      email: platformAdminEmail.trim(),
      role: "ADMIN",
      firstName: platformAdminFirstName.trim(),
      lastName: platformAdminLastName.trim(),
      country: platformAdminCountry,
      platformRole: platformAdminRole,
      organizationName: "",
    };

    addUserMutation.mutate(userData);
  };

  const handleCreateMember = () => {
    if (!memberOrgId) {
      toast({
        title: "Error",
        description: "Please select an organization",
        variant: "destructive",
      });
      return;
    }

    if (!memberEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    createOrgMemberMutation.mutate({
      orgId: memberOrgId,
      email: memberEmail.trim(),
      firstName: memberFirstName.trim() || "User",
      lastName: memberLastName.trim() || "",
      country: memberCountry,
      role: memberOrgRole,
    });
  };

  const getRoleBadgeColor = (type: string) => {
    switch (type) {
      case "PLATFORM_OWNER":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "PLATFORM_ADMIN":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "PLATFORM_FINANCIER":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "ADMIN":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "LABEL":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "TEAM":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "ARTIST_ORG":
      case "ARTIST":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
  };

  const OrganizationCard = ({ org }: { org: Organization }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { data: members = [], isLoading: isLoadingMembers } = useQuery<OrgMember[]>({
      queryKey: [`/api/admin/organizations/${org.id}/members`],
      retry: false,
    });

    const getOrgTypeBadge = (type: string) => {
      return type === "LABEL" ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    };

    const getOrgStatusBadge = (status: string) => {
      if (status === "AMBASSADOR") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      if (status === "TEST") return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      if (status === "MILITARY") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      if (status === "DISCOUNT_50") return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    };
    
    const getOrgStatusLabel = (status: string) => {
      if (status === "AMBASSADOR") return "Ambassador";
      if (status === "TEST") return "Test";
      if (status === "MILITARY") return "Military";
      if (status === "DISCOUNT_50") return "Discount 50%";
      return "Standard";
    };

    const availableUsers = users.filter(u => 
      !members.some(m => m.user.id === u.id) && !u.platformRole
    );

    return (
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="border rounded-lg p-4 bg-background hover:bg-muted/30 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Building2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{org.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge className={getOrgTypeBadge(org.type)}>
                    {org.type === "ARTIST_ORG" ? "Artist" : org.type === "PLAYLIST_CURATOR" ? "Curator" : "Label"}
                  </Badge>
                  {(org.type === "ARTIST_ORG" || org.type === "LABEL") && (
                    <Badge className={getOrgStatusBadge(org.status)}>
                      {getOrgStatusLabel(org.status)}
                    </Badge>
                  )}
                  {org.isFrozen && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      Frozen
                    </Badge>
                  )}
                  {org.freeReleases && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      Free
                    </Badge>
                  )}
                  {org.hasOrphanedMembers && (
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                      Orphaned
                    </Badge>
                  )}
                  {org.memberCount === 0 && (
                    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
                      Empty
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-8 sm:ml-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => {
                  setEditingOrg(org);
                  setOrgEditName(org.name);
                  setOrgEditType(org.type);
                  setOrgEditStatus(org.status);
                  setOrgEditFrozen(org.isFrozen ?? false);
                  setOrgEditFreeReleases(org.freeReleases ?? false);
                }}
              >
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">Edit</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setOrgToDelete({ orgId: org.id, orgName: org.name })}
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">Delete</span>
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <span className="hidden sm:inline">{isExpanded ? "Hide" : "Show"}</span>
                  <span className="sm:hidden">{isExpanded ? "▲" : "▼"}</span>
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>

          <CollapsibleContent className="mt-4 space-y-2">
            {isLoadingMembers ? (
              <div className="text-sm text-muted-foreground">Loading members...</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Members ({members.length})</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddMemberOrgId(org.id)}
                    className="flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Member
                  </Button>
                </div>

                {members.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No members yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3 flex-1">
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {member.user.firstName} {member.user.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={member.role}
                            onValueChange={(value) => {
                              updateMemberRoleMutation.mutate({
                                orgId: org.id,
                                memberId: member.id,
                                role: value,
                              });
                            }}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OWNER">Owner</SelectItem>
                              <SelectItem value="ADMIN">Admin</SelectItem>
                              <SelectItem value="MEMBER">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setMemberToDelete({
                                memberId: member.id,
                                userName: `${member.user.firstName} ${member.user.lastName}`,
                                orgName: org.name,
                              });
                            }}
                          >
                            <UserX className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <>
      <Tabs defaultValue="organizations" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="organizations" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Organizations
            <Badge variant="secondary" className="ml-1">{clientOrganizations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="org-members" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Org Members
            <Badge variant="secondary" className="ml-1">{users.filter(u => !u.platformRole && u.organizations && u.organizations.length > 0).length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="labels" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Labels
            <Badge variant="secondary" className="ml-1">{labelArtistLinks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="playlists" className="flex items-center gap-2">
            <Music className="w-4 h-4" />
            Playlists
          </TabsTrigger>
          <TabsTrigger value="admins" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Admins
            <Badge variant="secondary" className="ml-1">{users.filter(u => u.platformRole).length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organizations" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Organizations</CardTitle>
                <Badge variant="secondary">
                  {clientOrganizations.length} Organizations
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
          {/* Add New User Form */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Create New User
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country *</Label>
                <Select value={newCountry} onValueChange={setNewCountry}>
                  <SelectTrigger id="country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="orgType">Organization Type *</Label>
                <Select value={newOrgType} onValueChange={(value: any) => setNewOrgType(value)}>
                  <SelectTrigger id="orgType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARTIST_ORG">Artist</SelectItem>
                    <SelectItem value="LABEL">Label</SelectItem>
                    <SelectItem value="PLAYLIST_CURATOR">Playlist Curator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {(newOrgType === "ARTIST_ORG" || newOrgType === "LABEL") && (
                <div className="space-y-2">
                  <Label htmlFor="orgStatus">Organization Status *</Label>
                  <Select value={newOrgStatus} onValueChange={(value: any) => setNewOrgStatus(value)}>
                    <SelectTrigger id="orgStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">Standard</SelectItem>
                      <SelectItem value="AMBASSADOR">Ambassador (Discounted)</SelectItem>
                      <SelectItem value="TEST">Test (1 UAH)</SelectItem>
                      <SelectItem value="MILITARY">Military (-25%)</SelectItem>
                      <SelectItem value="DISCOUNT_50">Discount 50%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="orgName">Organization Name *</Label>
                <Input
                  id="orgName"
                  type="text"
                  placeholder="My Organization"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Organization name cannot be changed after creation
                </p>
              </div>
            </div>
            <Button 
              onClick={handleAddUser}
              disabled={addUserMutation.isPending}
              className="w-full"
            >
              {addUserMutation.isPending ? "Creating User..." : "Create User with Temporary Password"}
            </Button>
          </div>

          {/* Search Organizations */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations by name..."
              value={organizationsSearch}
              onChange={(e) => setOrganizationsSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Organization Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={orgTypeFilter} onValueChange={(v) => setOrgTypeFilter(v as typeof orgTypeFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ARTIST_ORG">Artist</SelectItem>
                <SelectItem value="LABEL">Label</SelectItem>
                <SelectItem value="PLAYLIST_CURATOR">Playlist Curator</SelectItem>
              </SelectContent>
            </Select>

            <Select value={orgStatusFilter} onValueChange={(v) => setOrgStatusFilter(v as typeof orgStatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="STANDARD">Standard</SelectItem>
                <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
                <SelectItem value="MILITARY">Military</SelectItem>
                <SelectItem value="DISCOUNT_50">Discount 50%</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-4 ml-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={orgFrozenFilter} 
                  onCheckedChange={(checked) => setOrgFrozenFilter(checked === true)}
                />
                <span>Frozen</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={orgFreeFilter} 
                  onCheckedChange={(checked) => setOrgFreeFilter(checked === true)}
                />
                <span>Free</span>
              </label>
            </div>
          </div>

          {/* Organizations List */}
          {isLoadingOrgs ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {organizationsSearch ? "No organizations found" : "No Client Organizations"}
              </h3>
              <p className="text-muted-foreground">
                {organizationsSearch ? "Try adjusting your search" : "Create a user with an organization to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrganizations.map((org) => (
                <OrganizationCard key={org.id} org={org} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="org-members" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Organization Members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add Member to Organization Form */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add Member to Organization
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="memberOrg">Organization *</Label>
                <Select value={memberOrgId} onValueChange={setMemberOrgId}>
                  <SelectTrigger id="memberOrg">
                    <SelectValue placeholder="Select organization..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.type === "ARTIST_ORG" ? "Artist" : org.type === "PLAYLIST_CURATOR" ? "Curator" : "Label"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberEmail">Email *</Label>
                <Input
                  id="memberEmail"
                  type="email"
                  placeholder="user@example.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberFirstName">First Name</Label>
                <Input
                  id="memberFirstName"
                  type="text"
                  placeholder="John"
                  value={memberFirstName}
                  onChange={(e) => setMemberFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberLastName">Last Name</Label>
                <Input
                  id="memberLastName"
                  type="text"
                  placeholder="Doe"
                  value={memberLastName}
                  onChange={(e) => setMemberLastName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberCountry">Country *</Label>
                <Select value={memberCountry} onValueChange={setMemberCountry}>
                  <SelectTrigger id="memberCountry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memberRole">Organization Role *</Label>
                <Select value={memberOrgRole} onValueChange={(value: any) => setMemberOrgRole(value)}>
                  <SelectTrigger id="memberRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              onClick={handleCreateMember}
              disabled={createOrgMemberMutation.isPending || !memberOrgId}
              className="w-full"
            >
              {createOrgMemberMutation.isPending ? "Adding Member..." : "Add Member to Organization"}
            </Button>
          </div>

          {/* Search Org Members */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or organization..."
              value={orgMembersSearch}
              onChange={(e) => setOrgMembersSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Organization Members List */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : filteredOrgMembers.length === 0 ? (
            <div className="text-center py-12">
              <UserIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {orgMembersSearch ? "No members found" : "No Organization Members Yet"}
              </h3>
              <p className="text-muted-foreground">
                {orgMembersSearch ? "Try adjusting your search" : "Add members to organizations to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrgMembers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-background border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <UserIcon className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      {user.organizations && user.organizations.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {user.organizations.map(org => org.name).join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={getRoleBadgeColor(user.platformRole || user.organizations?.[0]?.type || user.role)}>
                      <Shield className="w-3 h-3 mr-1" />
                      {user.platformRole || user.organizations?.[0]?.type || user.role}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedUserForEmail(user)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Send Email"
                    >
                      <Mail className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingUser(user);
                        setEditFirstName(user.firstName || "");
                        setEditLastName(user.lastName || "");
                        setEditEmail(user.email);
                        setEditCountry(user.country || "UA");
                        
                        // Get organization ID from user's organizations array
                        const userOrgId = user.organizations?.[0]?.id || "";
                        setEditOrgId(userOrgId);
                        
                        // Get user's role in organization from members cache
                        if (userOrgId) {
                          const members = getCachedMembers(userOrgId);
                          const member = members.find(m => m.user.id === user.id);
                          setEditOrgRole(member?.role || "MEMBER");
                        } else {
                          setEditOrgRole("MEMBER");
                        }
                        
                        // Reset password fields
                        setEditNewPassword("");
                        setEditConfirmPassword("");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit User"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUserMutation.mutate(user.id)}
                      disabled={removeUserMutation.isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete User"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="labels" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Label-Artist Links
            </CardTitle>
            <Badge variant="secondary">
              {labelArtistLinks.length} Links
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create New Link Form */}
          <div className="bg-muted/30 p-4 rounded-lg space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Create New Link
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="linkLabel">Label *</Label>
                <Select value={newLinkLabelId} onValueChange={setNewLinkLabelId}>
                  <SelectTrigger id="linkLabel">
                    <SelectValue placeholder="Select label..." />
                  </SelectTrigger>
                  <SelectContent>
                    {labelOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkArtist">Artist *</Label>
                <Select value={newLinkArtistId} onValueChange={setNewLinkArtistId}>
                  <SelectTrigger id="linkArtist">
                    <SelectValue placeholder="Select artist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {artistOrganizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkRevenue">Revenue Share %</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="linkRevenue"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={newLinkRevenueShare}
                    onChange={(e) => setNewLinkRevenueShare(e.target.value)}
                    className="w-24"
                  />
                  <Percent className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Label's share from artist revenue</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkPays">Who Pays for Releases?</Label>
                <Select 
                  value={newLinkLabelPays ? "label" : "artist"} 
                  onValueChange={(v) => setNewLinkLabelPays(v === "label")}
                >
                  <SelectTrigger id="linkPays">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="label">Label pays</SelectItem>
                    <SelectItem value="artist">Artist pays</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkFee">Fixed Release Fee (optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="linkFee"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newLinkFee}
                    onChange={(e) => setNewLinkFee(e.target.value)}
                    className="w-24"
                  />
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">USD per release</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkNotes">Notes (optional)</Label>
                <Input
                  id="linkNotes"
                  placeholder="Additional info..."
                  value={newLinkNotes}
                  onChange={(e) => setNewLinkNotes(e.target.value)}
                />
              </div>
            </div>
            <Button 
              onClick={handleCreateLabelLink}
              disabled={createLabelLinkMutation.isPending || !newLinkLabelId || !newLinkArtistId}
              className="w-full"
            >
              {createLabelLinkMutation.isPending ? "Creating Link..." : "Create Label-Artist Link"}
            </Button>
          </div>

          {/* Search Links */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by label or artist name..."
              value={labelsSearch}
              onChange={(e) => setLabelsSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Links List */}
          {isLoadingLinks ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : filteredLabelLinks.length === 0 ? (
            <div className="text-center py-12">
              <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {labelsSearch ? "No links found" : "No Label-Artist Links Yet"}
              </h3>
              <p className="text-muted-foreground">
                {labelsSearch ? "Try adjusting your search" : "Create a link to connect labels with artists"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLabelLinks.map((link) => {
                const labelName = link.labelOrg?.name || "Unknown Label";
                const artistName = link.artistOrg?.name || "Unknown Artist";
                return (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-4 bg-background border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Link2 className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {labelName} → {artistName}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          <Percent className="w-3 h-3 mr-1" />
                          {link.revenueSharePercent}% to label
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <CreditCard className="w-3 h-3 mr-1" />
                          {link.labelPaysReleases ? "Label pays" : "Artist pays"}
                        </Badge>
                        {link.fixedReleaseFee !== null && link.fixedReleaseFee !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            ${(link.fixedReleaseFee / 100).toFixed(2)}/release
                          </Badge>
                        )}
                        <Badge 
                          className={link.status === "ACTIVE" 
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" 
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300"
                          }
                        >
                          {link.status}
                        </Badge>
                      </div>
                      {link.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{link.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingLink(link);
                        setEditLinkRevenueShare(link.revenueSharePercent.toString());
                        setEditLinkLabelPays(link.labelPaysReleases);
                        setEditLinkFee(link.fixedReleaseFee !== null && link.fixedReleaseFee !== undefined ? (link.fixedReleaseFee / 100).toString() : "");
                        setEditLinkStatus(link.status);
                        setEditLinkNotes(link.notes || "");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit Link"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLinkToDelete({
                        id: link.id,
                        labelName: labelName,
                        artistName: artistName,
                      })}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete Link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="playlists" className="space-y-4">
      <LocalPlaylistsManager />
    </TabsContent>

    <TabsContent value="admins" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Platform Administrators
            </CardTitle>
            <Button onClick={() => setShowPlatformAdminDialog(true)} size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Platform Admin
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/50 rounded-lg p-4 animate-pulse">
                  <div className="h-5 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                </div>
              ))}
            </div>
          ) : users.filter(u => u.platformRole).length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Platform Administrators</h3>
              <p className="text-muted-foreground">
                Create platform admins to manage the system
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.filter(u => u.platformRole).map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg bg-background hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <Shield className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      {user.organizations && user.organizations.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Also member of: {user.organizations.map(org => org.name).join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <Shield className="w-3 h-3 mr-1" />
                      {user.platformRole}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>

      {/* Temporary Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              User Created Successfully
            </DialogTitle>
            <DialogDescription>
              A temporary password has been generated. Please save it securely - it will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-sm font-medium mb-2 block">Temporary Password</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background px-3 py-2 rounded border font-mono text-lg">
                  {tempPassword}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={copyPassword}
                  className={passwordCopied ? "bg-green-500/10" : ""}
                  title="Копіювати пароль"
                >
                  {passwordCopied ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            
            {/* Copy Email Template Button */}
            <Button
              variant="outline"
              className={`w-full ${templateCopied ? "bg-green-500/10 border-green-500" : ""}`}
              onClick={copyEmailTemplate}
            >
              {templateCopied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                  Шаблон скопійовано
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Копіювати шаблон листа
                </>
              )}
            </Button>
            
            <p className="text-sm text-muted-foreground">
              Натисніть "Копіювати шаблон листа" щоб скопіювати готовий текст з логіном та паролем для надсилання користувачу.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPasswordDialog(false)}>
              I've Saved the Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
              <p className="text-xs text-muted-foreground">Change user's email address if needed</p>
            </div>

            {/* First Name & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input
                  id="edit-firstName"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input
                  id="edit-lastName"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="edit-country">Country</Label>
              <Select value={editCountry} onValueChange={setEditCountry}>
                <SelectTrigger id="edit-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UA">Ukraine</SelectItem>
                  <SelectItem value="PL">Poland</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="DE">Germany</SelectItem>
                  <SelectItem value="FR">France</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Organization */}
            <div className="space-y-2">
              <Label htmlFor="edit-organization">Organization</Label>
              <Select value={editOrgId} onValueChange={setEditOrgId}>
                <SelectTrigger id="edit-organization">
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations
                    .filter(org => org.type === "ARTIST_ORG" || org.type === "LABEL")
                    .map(org => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.type === "ARTIST_ORG" ? "Artist" : org.type === "PLAYLIST_CURATOR" ? "Curator" : "Label"})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role in Organization */}
            <div className="space-y-2">
              <Label htmlFor="edit-org-role">Role in Organization</Label>
              <Select value={editOrgRole} onValueChange={(value: "OWNER" | "ADMIN" | "MEMBER") => setEditOrgRole(value)}>
                <SelectTrigger id="edit-org-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Password Section */}
            <div className="border-t pt-4 space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Change Password (Optional)</h4>
                <p className="text-xs text-muted-foreground">
                  Leave empty to keep current password
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-new-password">New Password</Label>
                <Input
                  id="edit-new-password"
                  type="password"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Enter new password (optional, min 8 chars)"
                />
                {editNewPassword && editNewPassword.length < 8 && (
                  <p className="text-xs text-destructive">Password must be at least 8 characters</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-confirm-password">Confirm Password</Label>
                <Input
                  id="edit-confirm-password"
                  type="password"
                  value={editConfirmPassword}
                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
                {editNewPassword && editConfirmPassword && editNewPassword !== editConfirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditingUser(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingUser) {
                  // Validate passwords match if provided
                  if (editNewPassword && editNewPassword !== editConfirmPassword) {
                    toast({
                      title: "Error",
                      description: "Passwords do not match",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Validate password length if provided
                  if (editNewPassword && editNewPassword.length < 8) {
                    toast({
                      title: "Error",
                      description: "Password must be at least 8 characters",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Validate both password fields are filled if one is filled
                  if ((editNewPassword && !editConfirmPassword) || (!editNewPassword && editConfirmPassword)) {
                    toast({
                      title: "Error",
                      description: "Please fill both password fields or leave both empty",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Validate email is not empty
                  if (!editEmail || !editEmail.trim()) {
                    toast({
                      title: "Error",
                      description: "Email cannot be empty",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Validate email format
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(editEmail.trim())) {
                    toast({
                      title: "Error",
                      description: "Invalid email format",
                      variant: "destructive",
                    });
                    return;
                  }

                  // Store old org ID for cache invalidation before mutation
                  const oldOrgId = editingUser.organizations?.[0]?.id;

                  updateUserMutation.mutate({ 
                    id: editingUser.id, 
                    firstName: editFirstName,
                    lastName: editLastName,
                    country: editCountry,
                    organizationId: editOrgId,
                    orgRole: editOrgRole,
                    password: editNewPassword || undefined,
                    oldOrgId: oldOrgId, // Pass for cache invalidation
                    email: editEmail.trim(), // Allow email change, trimmed
                  });
                }
              }}
              disabled={
                updateUserMutation.isPending || 
                !editOrgId || 
                !editEmail || 
                !editEmail.trim() ||
                (editNewPassword && editNewPassword.length < 8) ||
                (editConfirmPassword && editConfirmPassword.length < 8) ||
                (editNewPassword !== editConfirmPassword) ||
                (!editNewPassword && editConfirmPassword) ||
                (editNewPassword && !editConfirmPassword)
              }
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Dialog */}
      <Dialog open={!!selectedUserForEmail} onOpenChange={() => {
        setSelectedUserForEmail(null);
        setEmailMessage("");
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Send Email to User
            </DialogTitle>
            <DialogDescription>
              Send an email to {selectedUserForEmail?.firstName} {selectedUserForEmail?.lastName} ({selectedUserForEmail?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Enter your message here..."
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Subject: "muzika.ua повідомлення в особистому кабінеті"
                <br />
                Footer: "your answer in muzika-dist.com"
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedUserForEmail(null);
                setEmailMessage("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUserForEmail && emailMessage.trim()) {
                  sendEmailMutation.mutate({ 
                    userId: selectedUserForEmail.id, 
                    message: emailMessage.trim() 
                  });
                }
              }}
              disabled={sendEmailMutation.isPending || !emailMessage.trim()}
            >
              {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!addMemberOrgId} onOpenChange={() => {
        setAddMemberOrgId(null);
        setNewMemberUserId("");
        setNewMemberRole("MEMBER");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add Organization Member
            </DialogTitle>
            <DialogDescription>
              Add an existing user to this organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-user">User</Label>
              <Select value={newMemberUserId} onValueChange={setNewMemberUserId}>
                <SelectTrigger id="member-user">
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    if (!addMemberOrgId) return null;
                    
                    const members = getCachedMembers(addMemberOrgId);
                    const availableUsers = users.filter(u => 
                      !u.platformRole && !members.some(m => m.user.id === u.id)
                    );
                    
                    if (availableUsers.length === 0) {
                      return (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          No available users to add
                        </div>
                      );
                    }
                    
                    return availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <Select value={newMemberRole} onValueChange={(value: any) => setNewMemberRole(value)}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setAddMemberOrgId(null);
                setNewMemberUserId("");
                setNewMemberRole("MEMBER");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (addMemberOrgId && newMemberUserId) {
                  addOrgMemberMutation.mutate({
                    orgId: addMemberOrgId,
                    userId: newMemberUserId,
                    role: newMemberRole,
                  });
                }
              }}
              disabled={addOrgMemberMutation.isPending || !newMemberUserId}
            >
              {addOrgMemberMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Organization Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToDelete?.userName}</strong> from <strong>{memberToDelete?.orgName}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (memberToDelete) {
                  const orgId = organizations.find(org => org.name === memberToDelete.orgName)?.id;
                  if (orgId) {
                    removeMemberMutation.mutate({
                      orgId,
                      memberId: memberToDelete.memberId,
                    });
                  }
                }
              }}
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Organization Confirmation */}
      <AlertDialog open={!!orgToDelete} onOpenChange={() => setOrgToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{orgToDelete?.orgName}</strong>?
              This will permanently delete the organization and all associated data including members, releases, and files.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (orgToDelete) {
                  deleteOrganizationMutation.mutate(orgToDelete.orgId);
                }
              }}
            >
              Delete Organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Organization Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => {
        if (!open) {
          setEditingOrg(null);
          setShowDeleteConfirmation(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-org-name">Organization Name</Label>
              <Input
                id="edit-org-name"
                value={orgEditName}
                onChange={(e) => setOrgEditName(e.target.value)}
                placeholder="Organization Name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-org-type">Organization Type</Label>
              <Select 
                value={orgEditType} 
                onValueChange={(value: "ARTIST_ORG" | "LABEL" | "PLAYLIST_CURATOR") => {
                  setOrgEditType(value);
                  if (value !== "ARTIST_ORG" && value !== "LABEL") {
                    setOrgEditStatus("STANDARD");
                  }
                }}
              >
                <SelectTrigger id="edit-org-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARTIST_ORG">Artist</SelectItem>
                  <SelectItem value="LABEL">Label</SelectItem>
                  <SelectItem value="PLAYLIST_CURATOR">Playlist Curator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(orgEditType === "ARTIST_ORG" || orgEditType === "LABEL") && (
              <div className="space-y-2">
                <Label htmlFor="edit-org-status">Organization Status</Label>
                <Select value={orgEditStatus} onValueChange={(value: "STANDARD" | "AMBASSADOR" | "TEST" | "MILITARY" | "DISCOUNT_50") => setOrgEditStatus(value)}>
                  <SelectTrigger id="edit-org-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">Standard</SelectItem>
                    <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
                    <SelectItem value="TEST">Test (1 UAH)</SelectItem>
                    <SelectItem value="MILITARY">Military (-25%)</SelectItem>
                    <SelectItem value="DISCOUNT_50">Discount 50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="edit-org-frozen"
                checked={orgEditFrozen}
                onCheckedChange={(checked) => setOrgEditFrozen(checked === true)}
              />
              <Label 
                htmlFor="edit-org-frozen" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Freeze access (block all members from accessing this organization)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-org-free-releases"
                checked={orgEditFreeReleases}
                onCheckedChange={(checked) => setOrgEditFreeReleases(checked === true)}
              />
              <Label 
                htmlFor="edit-org-free-releases" 
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Free releases (organization can publish releases without payment)
              </Label>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => {
                if (editingOrg) {
                  updateOrganizationMutation.mutate({
                    id: editingOrg.id,
                    name: orgEditName,
                    type: orgEditType,
                    status: (orgEditType === "ARTIST_ORG" || orgEditType === "LABEL") ? orgEditStatus : undefined,
                    isFrozen: orgEditFrozen,
                    freeReleases: orgEditFreeReleases,
                  });
                }
              }}
              disabled={updateOrganizationMutation.isPending || !orgEditName.trim()}
            >
              {updateOrganizationMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>

            {!showDeleteConfirmation ? (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirmation(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Organization
              </Button>
            ) : (
              <div className="space-y-2 p-3 border border-destructive rounded-lg bg-destructive/10">
                <p className="text-sm font-medium text-destructive">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirmation(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (editingOrg) {
                        deleteOrganizationMutation.mutate(editingOrg.id);
                      }
                    }}
                    disabled={deleteOrganizationMutation.isPending}
                    className="flex-1"
                  >
                    {deleteOrganizationMutation.isPending ? "Deleting..." : "Confirm Delete"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Platform Admin Creation Dialog */}
      <Dialog open={showPlatformAdminDialog} onOpenChange={setShowPlatformAdminDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Create Platform Administrator
            </DialogTitle>
            <DialogDescription>
              Add a new platform administrator. They will receive an email with login credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platform-admin-email">Email *</Label>
              <Input
                id="platform-admin-email"
                type="email"
                placeholder="admin@example.com"
                value={platformAdminEmail}
                onChange={(e) => setPlatformAdminEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-admin-first-name">First Name *</Label>
              <Input
                id="platform-admin-first-name"
                type="text"
                placeholder="John"
                value={platformAdminFirstName}
                onChange={(e) => setPlatformAdminFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-admin-last-name">Last Name *</Label>
              <Input
                id="platform-admin-last-name"
                type="text"
                placeholder="Doe"
                value={platformAdminLastName}
                onChange={(e) => setPlatformAdminLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-admin-country">Country *</Label>
              <Select value={platformAdminCountry} onValueChange={setPlatformAdminCountry}>
                <SelectTrigger id="platform-admin-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {countries.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-admin-role">Platform Role *</Label>
              <Select value={platformAdminRole} onValueChange={(value: any) => setPlatformAdminRole(value)}>
                <SelectTrigger id="platform-admin-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLATFORM_OWNER">Platform Owner</SelectItem>
                  <SelectItem value="PLATFORM_ADMIN">Platform Admin</SelectItem>
                  <SelectItem value="PLATFORM_FINANCIER">Platform Financier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPlatformAdminDialog(false);
                setPlatformAdminEmail("");
                setPlatformAdminFirstName("");
                setPlatformAdminLastName("");
                setPlatformAdminCountry("UA");
                setPlatformAdminRole("PLATFORM_ADMIN");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePlatformAdmin}
              disabled={addUserMutation.isPending}
            >
              {addUserMutation.isPending ? "Creating..." : "Create Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Label Link Dialog */}
      <Dialog open={!!editingLink} onOpenChange={() => setEditingLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Edit Label-Artist Link
            </DialogTitle>
            <DialogDescription>
              {editingLink?.labelOrg?.name} → {editingLink?.artistOrg?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-link-revenue">Revenue Share %</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-link-revenue"
                  type="number"
                  min="0"
                  max="100"
                  value={editLinkRevenueShare}
                  onChange={(e) => setEditLinkRevenueShare(e.target.value)}
                  className="w-24"
                />
                <Percent className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Label's share from artist revenue</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-pays">Who Pays for Releases?</Label>
              <Select 
                value={editLinkLabelPays ? "label" : "artist"} 
                onValueChange={(v) => setEditLinkLabelPays(v === "label")}
              >
                <SelectTrigger id="edit-link-pays">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="label">Label pays</SelectItem>
                  <SelectItem value="artist">Artist pays</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-fee">Fixed Release Fee (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-link-fee"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={editLinkFee}
                  onChange={(e) => setEditLinkFee(e.target.value)}
                  className="w-24"
                />
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">USD per release</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-status">Status</Label>
              <Select value={editLinkStatus} onValueChange={(v: "ACTIVE" | "INACTIVE") => setEditLinkStatus(v)}>
                <SelectTrigger id="edit-link-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-link-notes">Notes (optional)</Label>
              <Input
                id="edit-link-notes"
                placeholder="Additional info..."
                value={editLinkNotes}
                onChange={(e) => setEditLinkNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingLink(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateLabelLink}
              disabled={updateLabelLinkMutation.isPending}
            >
              {updateLabelLinkMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Label Link Confirmation */}
      <AlertDialog open={!!linkToDelete} onOpenChange={() => setLinkToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Label-Artist Link?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the link between <strong>{linkToDelete?.labelName}</strong> and <strong>{linkToDelete?.artistName}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (linkToDelete) {
                  deleteLabelLinkMutation.mutate(linkToDelete.id);
                }
              }}
            >
              Delete Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
