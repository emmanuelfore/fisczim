import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useBranches } from "@/hooks/use-branches";
import { useCostCenters } from "@/hooks/use-cost-centers";
import { useCompanies } from "@/hooks/use-companies";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Loader2,
  LockKeyhole,
  MapPin,
  Save,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { ALL_PERMISSIONS, PERMISSION_GROUPS as SYSTEM_PERMISSION_GROUPS } from "@shared/permissions";

type AccessRole = {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
  memberCount?: number;
  isSystem?: boolean;
  legacyRole?: string | null;
};

export default function TeamSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rawId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const storedCompanyId = isNaN(rawId) ? 0 : rawId;
  const { data: companies, isLoading: isLoadingCompanies } = useCompanies();
  const currentCompany =
    companies?.find((c) => c.id === storedCompanyId) || companies?.[0];
  const companyId = currentCompany?.id || 0;

  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingRole, setEditingRole] = useState<AccessRole | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: "",
    name: "",
    username: "",
    password: "Zimra123!",
    roleId: "",
  });
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const [accessDraft, setAccessDraft] = useState({
    accessRoleId: "",
    branchIds: [] as number[],
    ownerGroupScope: "",
  });

  const systemPermissionGroups = useMemo(() => {
    return SYSTEM_PERMISSION_GROUPS.map((group) => ({
      label: group,
      items: ALL_PERMISSIONS.filter((p) => p.group === group).map((p) => [p.key, p.label, p.description]),
    })).filter((g) => g.items.length > 0);
  }, []);

  const usersQuery = useQuery({
    queryKey: ["users", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });
  const accessRolesQuery = useQuery<AccessRole[]>({
    queryKey: ["access-roles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/access-roles`);
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });
  const { data: branches = [] } = useBranches(companyId);
  const { data: costCenters = [] } = useCostCenters(companyId);

  const users = usersQuery.data || [];
  const accessRoles = accessRolesQuery.data || [];
  const ownerCount = users.filter((user: any) => user.role === "owner").length;
  const branchScopedCount = users.filter((user: any) => user.branchIds?.length).length;

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ["users", companyId] });
    queryClient.invalidateQueries({ queryKey: ["access-roles", companyId] });
  };

  // Set default roleId when accessRoles loads
  useEffect(() => {
    if (accessRoles.length > 0 && !userForm.roleId) {
      const defaultRole = accessRoles.find(r => r.legacyRole === 'member') || accessRoles[0];
      setUserForm(p => ({ ...p, roleId: String(defaultRole.id) }));
    }
  }, [accessRoles]);

  const addUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: userForm.email,
          name: userForm.name,
          username: userForm.username,
          password: userForm.password,
          roleId: userForm.roleId ? Number(userForm.roleId) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add user");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateTeam();
      setIsAddUserOpen(false);
      const defaultRole = accessRoles.find(r => r.legacyRole === 'member') || accessRoles[0];
      setUserForm({ email: "", name: "", username: "", password: "Zimra123!", roleId: defaultRole ? String(defaultRole.id) : "" });
      toast({ title: "User Added", description: "The team member was added." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/companies/${companyId}/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to remove user");
      }
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "User Removed", description: "The user was removed from the company." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateUserAccessMutation = useMutation({
    mutationFn: async ({ userId, payload }: { userId: string; payload: any }) => {
      const res = await apiFetch(`/api/companies/${companyId}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update access");
      }
    },
    onSuccess: () => {
      invalidateTeam();
      setEditingUser(null);
      toast({ title: "Access Updated", description: "User access was saved." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const path = editingRole
        ? `/api/companies/${companyId}/access-roles/${editingRole.id}`
        : `/api/companies/${companyId}/access-roles`;
      const res = await apiFetch(path, {
        method: editingRole ? "PATCH" : "POST",
        body: JSON.stringify(roleForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save role");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateTeam();
      setIsRoleDialogOpen(false);
      setEditingRole(null);
      setRoleForm({ name: "", description: "", permissions: [] });
      toast({ title: "Role Saved", description: "Permissions were updated." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/access-roles/${roleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete role");
      }
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "Role Deleted", description: "Users were detached from that role." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openUserAccess = (user: any) => {
    setEditingUser(user);
    let targetRoleId = "";
    if (user.companyRoleId) {
      targetRoleId = String(user.companyRoleId);
    } else if (user.role) {
      const matched = accessRoles.find((r) => r.legacyRole === user.role);
      if (matched) {
        targetRoleId = String(matched.id);
      }
    }
    setAccessDraft({
      accessRoleId: targetRoleId,
      branchIds: Array.isArray(user.branchIds) ? user.branchIds.map(Number) : [],
      ownerGroupScope: user.ownerGroupScope || "",
    });
  };

  const openRoleDialog = (role?: AccessRole) => {
    setEditingRole(role || null);
    setRoleForm({
      name: role?.name || "",
      description: role?.description || "",
      permissions: role?.permissions || [],
    });
    setIsRoleDialogOpen(true);
  };

  const NAV_GROUP_MAP: Record<string, string[]> = {
    "nav.pos": ["Sales"],
    "nav.invoices": ["Sales"],
    "nav.inventory": ["Inventory", "Procurement"],
    "nav.accounting": ["Finance"],
    "nav.reports": ["Reports"],
    "nav.restaurant": ["Restaurant"],
    "nav.compliance": ["Tax & Compliance"],
    "nav.users": ["Administration"],
    "nav.approvals": ["Administration"],
    "nav.settings": ["Administration"],
    "nav.payroll": ["HR & Payroll"],
    "nav.bus": ["Transport & Bus Ticketing"],
    "nav.manufacturing": ["Manufacturing"],
  };

  const togglePermission = (permission: string, checked: boolean) => {
    setRoleForm((prev) => {
      const next = new Set(prev.permissions);
      const def = ALL_PERMISSIONS.find((p) => p.key === permission);

      if (checked) {
        next.add(permission);

        // Intelligent select: If a sub-permission is checked, automatically check its parent nav item
        if (def && def.group !== "Navigation") {
          const navKeys = Object.keys(NAV_GROUP_MAP).filter((navKey) =>
            NAV_GROUP_MAP[navKey].includes(def.group)
          );
          navKeys.forEach((navKey) => next.add(navKey));
        }

        // Optional intelligent auto-fill: if a navigation item is checked, we could pre-fill some defaults,
        // but it's safer to just require the user to pick what specific sub-actions they want.
      } else {
        next.delete(permission);

        // Intelligent unselect: If a nav permission is unchecked, automatically uncheck all its sub-permissions
        if (NAV_GROUP_MAP[permission]) {
          const groupsToClear = NAV_GROUP_MAP[permission];
          ALL_PERMISSIONS.forEach((p) => {
            if (groupsToClear.includes(p.group)) {
              next.delete(p.key);
            }
          });
        }
      }
      return { ...prev, permissions: Array.from(next) };
    });
  };

  const toggleGroup = (groupLabel: string, checked: boolean) => {
    setRoleForm((prev) => {
      const next = new Set(prev.permissions);
      const groupItems = ALL_PERMISSIONS.filter((p) => p.group === groupLabel);
      
      groupItems.forEach(p => {
        if (checked) {
          next.add(p.key);
          // Auto-check parent nav item
          if (p.group !== "Navigation") {
            const navKeys = Object.keys(NAV_GROUP_MAP).filter((navKey) =>
              NAV_GROUP_MAP[navKey].includes(p.group)
            );
            navKeys.forEach((navKey) => next.add(navKey));
          }
        } else {
          next.delete(p.key);
          // If unchecking a nav item, clear children
          if (NAV_GROUP_MAP[p.key]) {
            const groupsToClear = NAV_GROUP_MAP[p.key];
            ALL_PERMISSIONS.forEach((subP) => {
              if (groupsToClear.includes(subP.group)) {
                next.delete(subP.key);
              }
            });
          }
        }
      });
      return { ...prev, permissions: Array.from(next) };
    });
  };

  const selectAllPermissions = () => {
    setRoleForm(p => ({ ...p, permissions: ALL_PERMISSIONS.map(def => def.key) }));
  };

  const deselectAllPermissions = () => {
    setRoleForm(p => ({ ...p, permissions: [] }));
  };

  const accessRoleById = useMemo(
    () => new Map(accessRoles.map((role) => [role.id, role])),
    [accessRoles],
  );

  if (isLoadingCompanies) {
    return (
      <Layout>
        <div className="p-8">Loading...</div>
      </Layout>
    );
  }

  if (!currentCompany) {
    return (
      <Layout>
        <div className="p-8">No company selected.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Team Management"
        subtitle={`Manage users, custom roles, permissions, and branch scope for ${currentCompany.name}`}
        actions={
          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>Create a login and assign the starting system role.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={userForm.name} onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={userForm.username} onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Initial Password</Label>
                    <Input type="password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={userForm.roleId} onValueChange={(roleId) => setUserForm((p) => ({ ...p, roleId }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {accessRoles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
                <Button disabled={addUserMutation.isPending || !userForm.email} onClick={() => addUserMutation.mutate()}>
                  {addUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Add User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricCard icon={Users} label="Users" value={users.length} />
        <MetricCard icon={Shield} label="Owners" value={ownerCount} />
        <MetricCard icon={LockKeyhole} label="Roles" value={accessRoles.length} />
        <MetricCard icon={Building2} label="Branch Scoped" value={branchScopedCount} />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permission Catalogue</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage people separately from their detailed access rules.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {usersQuery.isLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading users...</div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">No users found.</div>
              ) : (
                users.map((user: any) => (
                  <div key={user.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900">{user.name || user.email}</p>
                        <Badge variant="secondary">{user.companyRoleName || user.role || "member"}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{user.email}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {user.branchIds?.length ? `${user.branchIds.length} branch${user.branchIds.length === 1 ? "" : "es"}` : "All branches"}
                        {user.ownerGroupScope ? ` - Cost Center: ${user.ownerGroupScope}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => openUserAccess(user)}>
                        <UserCog className="h-4 w-4" />
                        Access
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => confirm("Remove this user?") && removeUserMutation.mutate(user.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Create roles and select exactly what they can do. System roles can be edited but not deleted.</CardDescription>
              </div>
              <Button onClick={() => openRoleDialog()}>
                <LockKeyhole className="h-4 w-4" />
                New Role
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accessRoles.length === 0 ? (
                <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                  No roles found.
                </div>
              ) : (
                accessRoles.map((role) => (
                  <div key={role.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900">{role.name}</p>
                          {role.isSystem && <Badge variant="secondary">System</Badge>}
                        </div>
                        <p className="text-sm text-slate-500">{role.description || "No description"}</p>
                      </div>
                      <Badge variant="outline">{role.memberCount || 0} users</Badge>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-1">
                      {(role.permissions || []).slice(0, 5).map((permission) => (
                        <Badge key={permission} variant="secondary">{permission}</Badge>
                      ))}
                      {(role.permissions || []).length > 5 ? <Badge variant="outline">+{role.permissions.length - 5}</Badge> : null}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openRoleDialog(role)}>Edit</Button>
                      {!role.isSystem && (
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => confirm("Delete this role?") && deleteRoleMutation.mutate(role.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle>Permission Catalogue</CardTitle>
              <CardDescription>These permissions are used by roles.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {systemPermissionGroups.map((group) => (
                <div key={group.label} className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-3 font-bold text-slate-900">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map(([key, label, description]) => (
                      <div key={key} className="flex flex-col gap-1 border-b border-slate-100 py-2 last:border-0">
                        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                          <span>{label}</span>
                          <code className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{key}</code>
                        </div>
                        {description && <span className="text-xs text-slate-400">{description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Access</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Role</Label>
                <Select value={accessDraft.accessRoleId} onValueChange={(accessRoleId) => setAccessDraft((p) => ({ ...p, accessRoleId }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accessRoles.map((role) => <SelectItem key={role.id} value={String(role.id)}>{role.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Branch Access</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 p-3">
                {branches.length === 0 ? (
                  <span className="text-sm text-slate-500">No branches configured.</span>
                ) : (
                  branches.map((branch: any) => (
                    <label key={branch.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-600">
                      <Checkbox
                        checked={accessDraft.branchIds.includes(branch.id)}
                        onCheckedChange={(checked) => {
                          setAccessDraft((prev) => {
                            const next = new Set(prev.branchIds);
                            if (checked === true) next.add(branch.id);
                            else next.delete(branch.id);
                            return { ...prev, branchIds: Array.from(next) };
                          });
                        }}
                      />
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {branch.name}
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-slate-500">Leave all unchecked for all-branch access.</p>
            </div>
            <div className="space-y-2">
              <Label>Cost Center Scope</Label>
              <Select
                value={accessDraft.ownerGroupScope || "all"}
                onValueChange={(val) =>
                  setAccessDraft((p) => ({ ...p, ownerGroupScope: val === "all" ? "" : val }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Cost Centers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cost Centers (Unrestricted)</SelectItem>
                  {costCenters.map((cc) => (
                    <SelectItem key={cc.id} value={cc.name}>
                      {cc.name} ({cc.code})
                    </SelectItem>
                  ))}
                  {accessDraft.ownerGroupScope && !costCenters.some(cc => cc.name === accessDraft.ownerGroupScope) && (
                    <SelectItem value={accessDraft.ownerGroupScope}>
                      {accessDraft.ownerGroupScope} (Legacy/Unmanaged)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button
              disabled={updateUserAccessMutation.isPending}
              onClick={() =>
                updateUserAccessMutation.mutate({
                  userId: editingUser.id,
                  payload: {
                    accessRoleId: accessDraft.accessRoleId ? Number(accessDraft.accessRoleId) : null,
                    branchIds: accessDraft.branchIds,
                    ownerGroupScope: accessDraft.ownerGroupScope.trim() || null,
                  },
                })
              }
            >
              {updateUserAccessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "New Role"}</DialogTitle>
            <DialogDescription>Select permissions for this role. System roles can be customized.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} disabled={editingRole?.isSystem} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea className="min-h-[40px]" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} disabled={editingRole?.isSystem} />
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base">Permissions</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllPermissions} disabled={editingRole?.isSystem}>Select All</Button>
                <Button type="button" variant="outline" size="sm" onClick={deselectAllPermissions} disabled={editingRole?.isSystem}>Deselect All</Button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {systemPermissionGroups.map((group) => {
                const isAllSelected = group.items.length > 0 && group.items.every(([key]) => roleForm.permissions.includes(key));
                const isIndeterminate = !isAllSelected && group.items.some(([key]) => roleForm.permissions.includes(key));
                return (
                  <div key={group.label} className="rounded-lg border border-slate-200 p-4">
                    <label className="flex items-center gap-2 mb-3 cursor-pointer">
                      <Checkbox 
                        checked={isAllSelected || (isIndeterminate ? "indeterminate" : false)} 
                        onCheckedChange={(checked) => toggleGroup(group.label, checked === true)} 
                        disabled={editingRole?.isSystem}
                      />
                      <p className="font-bold text-slate-900">{group.label}</p>
                    </label>
                  <div className="space-y-3">
                    {group.items.map(([key, label, description]) => (
                      <label key={key} className="flex items-start gap-3 text-sm font-medium text-slate-700 hover:bg-slate-50 p-1.5 rounded-md cursor-pointer">
                        <Checkbox checked={roleForm.permissions.includes(key)} onCheckedChange={(checked) => togglePermission(key, checked === true)} disabled={editingRole?.isSystem} />
                        <div>
                          <span className="block">{label}</span>
                          {description && <span className="block text-xs text-slate-400 font-normal">{description}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )})}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
            <Button disabled={saveRoleMutation.isPending || !roleForm.name.trim()} onClick={() => saveRoleMutation.mutate()}>
              {saveRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-xl font-black text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
