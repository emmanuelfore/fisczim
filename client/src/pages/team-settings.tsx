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
import { useMemo, useState } from "react";

const PERMISSION_GROUPS = [
  {
    label: "Sales",
    items: [
      ["sales.view", "View sales"],
      ["sales.create", "Create invoices/POS sales"],
      ["sales.refund", "Process refunds and credit notes"],
      ["payments.manage", "Record payments"],
    ],
  },
  {
    label: "Inventory",
    items: [
      ["inventory.view", "View stock"],
      ["inventory.adjust", "Adjust stock"],
      ["inventory.transfer", "Dispatch and receive transfers"],
      ["inventory.procure", "Manage PO, GRV and GDN"],
    ],
  },
  {
    label: "Accounting",
    items: [
      ["accounting.view", "View accounting"],
      ["accounting.post", "Post journals and opening balances"],
      ["accounting.payables", "Manage suppliers and bills"],
      ["accounting.reports", "View accounting reports"],
    ],
  },
  {
    label: "Administration",
    items: [
      ["reports.view", "View reports"],
      ["settings.manage", "Manage company settings"],
      ["team.manage", "Manage users and access"],
      ["zimra.manage", "Manage fiscal/ZIMRA setup"],
    ],
  },
] as const;

type AccessRole = {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
  memberCount?: number;
};

const builtInRoles = ["owner", "admin", "member", "cashier"];

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
    role: "member",
  });
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const [accessDraft, setAccessDraft] = useState({
    role: "member",
    accessRoleId: "none",
    branchIds: [] as number[],
    ownerGroupScope: "",
  });

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
      if (!res.ok) throw new Error("Failed to fetch access profiles");
      return res.json();
    },
  });
  const { data: branches = [] } = useBranches(companyId);

  const users = usersQuery.data || [];
  const accessRoles = accessRolesQuery.data || [];
  const ownerCount = users.filter((user: any) => user.role === "owner").length;
  const branchScopedCount = users.filter((user: any) => user.branchIds?.length).length;

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ["users", companyId] });
    queryClient.invalidateQueries({ queryKey: ["access-roles", companyId] });
  };

  const addUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/users`, {
        method: "POST",
        body: JSON.stringify(userForm),
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
      setUserForm({ email: "", name: "", username: "", password: "Zimra123!", role: "member" });
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
        throw new Error(err.message || "Failed to save access profile");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateTeam();
      setIsRoleDialogOpen(false);
      setEditingRole(null);
      setRoleForm({ name: "", description: "", permissions: [] });
      toast({ title: "Access Profile Saved", description: "Permissions were updated." });
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
        throw new Error(err.message || "Failed to delete access profile");
      }
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "Access Profile Deleted", description: "Users were detached from that profile." });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const openUserAccess = (user: any) => {
    setEditingUser(user);
    setAccessDraft({
      role: user.role || "member",
      accessRoleId: user.accessRoleId ? String(user.accessRoleId) : "none",
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

  const togglePermission = (permission: string, checked: boolean) => {
    setRoleForm((prev) => {
      const next = new Set(prev.permissions);
      if (checked) next.add(permission);
      else next.delete(permission);
      return { ...prev, permissions: Array.from(next) };
    });
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
        subtitle={`Manage users, custom access profiles, permissions, and branch scope for ${currentCompany.name}`}
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
                    <Label>System Role</Label>
                    <Select value={userForm.role} onValueChange={(role) => setUserForm((p) => ({ ...p, role }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {builtInRoles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
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
        <MetricCard icon={LockKeyhole} label="Access Profiles" value={accessRoles.length} />
        <MetricCard icon={Building2} label="Branch Scoped" value={branchScopedCount} />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Access Profiles</TabsTrigger>
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
                        <Badge variant="secondary">{user.role || "member"}</Badge>
                        {user.accessRoleId ? <Badge variant="outline">{accessRoleById.get(user.accessRoleId)?.name || user.accessRole?.name || "Custom profile"}</Badge> : null}
                      </div>
                      <p className="text-sm text-slate-500">{user.email}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {user.branchIds?.length ? `${user.branchIds.length} branch${user.branchIds.length === 1 ? "" : "es"}` : "All branches"}
                        {user.ownerGroupScope ? ` - ${user.ownerGroupScope}` : ""}
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
                <CardTitle>Access Profiles</CardTitle>
                <CardDescription>Create custom roles and select exactly what they can do.</CardDescription>
              </div>
              <Button onClick={() => openRoleDialog()}>
                <LockKeyhole className="h-4 w-4" />
                New Profile
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accessRoles.length === 0 ? (
                <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                  No custom access profiles yet.
                </div>
              ) : (
                accessRoles.map((role) => (
                  <div key={role.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{role.name}</p>
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
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => confirm("Delete this access profile?") && deleteRoleMutation.mutate(role.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
              <CardDescription>These permissions are used by custom access profiles.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-3 font-bold text-slate-900">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3 text-sm">
                        <span>{label}</span>
                        <code className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{key}</code>
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
              <div className="space-y-2">
                <Label>System Role</Label>
                <Select value={accessDraft.role} onValueChange={(role) => setAccessDraft((p) => ({ ...p, role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {builtInRoles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Access Profile</Label>
                <Select value={accessDraft.accessRoleId} onValueChange={(accessRoleId) => setAccessDraft((p) => ({ ...p, accessRoleId }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No custom profile</SelectItem>
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
              <Label>Cost Center / Owner Group Scope</Label>
              <Input
                value={accessDraft.ownerGroupScope}
                onChange={(e) => setAccessDraft((p) => ({ ...p, ownerGroupScope: e.target.value }))}
                placeholder="Optional, for example Beauty or Mother"
              />
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
                    role: accessDraft.role,
                    accessRoleId: accessDraft.accessRoleId === "none" ? null : Number(accessDraft.accessRoleId),
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Access Profile" : "New Access Profile"}</DialogTitle>
            <DialogDescription>Select permissions for this custom user group.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea className="min-h-[40px]" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-3 font-bold text-slate-900">{group.label}</p>
                  <div className="space-y-3">
                    {group.items.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                        <Checkbox checked={roleForm.permissions.includes(key)} onCheckedChange={(checked) => togglePermission(key, checked === true)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancel</Button>
            <Button disabled={saveRoleMutation.isPending || !roleForm.name.trim()} onClick={() => saveRoleMutation.mutate()}>
              {saveRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Profile
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
