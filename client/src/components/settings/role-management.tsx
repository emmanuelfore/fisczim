import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Shield, Copy, Pencil, Trash2 } from "lucide-react";
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from "@shared/permissions";

interface RoleManagementProps {
  companyId: number;
}

type CompanyRole = {
  id: number;
  name: string;
  description?: string | null;
  isSystem: boolean;
  legacyRole?: string | null;
  permissions: string[];
};

export function RoleManagement({ companyId }: RoleManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("roles.manage");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CompanyRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["company-roles", companyId],
    queryFn: async () => {
      const res = await apiFetch(`/api/companies/${companyId}/roles`);
      if (!res.ok) throw new Error("Failed to load roles");
      return await res.json() as CompanyRole[];
    },
    enabled: !!companyId && can("roles.view"),
  });

  const groupedPermissions = useMemo(() => {
    return PERMISSION_GROUPS.map((group) => ({
      group,
      items: ALL_PERMISSIONS.filter((p) => p.group === group),
    })).filter((g) => g.items.length > 0);
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setEditorOpen(true);
  };

  const openEdit = (role: CompanyRole) => {
    if (role.isSystem) {
      toast({ title: "System role", description: "Clone this role to customize permissions.", variant: "destructive" });
      return;
    }
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || "");
    setSelectedPermissions(role.permissions);
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description, permissions: selectedPermissions };
      const url = editingRole
        ? `/api/companies/${companyId}/roles/${editingRole.id}`
        : `/api/companies/${companyId}/roles`;
      const res = await apiFetch(url, {
        method: editingRole ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save role");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-roles", companyId] });
      setEditorOpen(false);
      toast({ title: "Role saved", description: "Role permissions updated successfully." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const cloneMutation = useMutation({
    mutationFn: async (role: CompanyRole) => {
      const newName = `${role.name} (Custom)`;
      const res = await apiFetch(`/api/companies/${companyId}/roles/${role.id}/clone`, {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to clone role");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-roles", companyId] });
      toast({ title: "Role cloned", description: "You can now customize the cloned role." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleId: number) => {
      const res = await apiFetch(`/api/companies/${companyId}/roles/${roleId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete role");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-roles", companyId] });
      toast({ title: "Role deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const togglePermission = (key: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const toggleGroup = (keys: string[]) => {
    const allSelected = keys.every((k) => selectedPermissions.includes(k));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((p) => !keys.includes(p)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...keys])));
    }
  };

  if (!can("roles.view")) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          You do not have permission to view roles.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles & Permissions
            </CardTitle>
            <CardDescription>
              Create custom roles and control what each user can see and do. System roles can be cloned for customization.
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={openCreate} className="rounded-[10px]">
              <Plus className="mr-2 h-4 w-4" />
              New Role
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid gap-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-[12px] border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{role.name}</h3>
                        {role.isSystem && <Badge variant="secondary">System</Badge>}
                        {role.legacyRole && <Badge variant="outline">{role.legacyRole}</Badge>}
                      </div>
                      {role.description && <p className="mt-1 text-sm text-slate-500">{role.description}</p>}
                      <p className="mt-2 text-xs text-slate-400">{role.permissions.length} permissions</p>
                    </div>
                    <div className="flex gap-2">
                      {canManage && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => cloneMutation.mutate(role)} disabled={cloneMutation.isPending}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            Clone
                          </Button>
                          {!role.isSystem && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => openEdit(role)}>
                                <Pencil className="mr-1 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(role.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Role name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse Supervisor" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for" />
            </div>
            <div className="space-y-4">
              <Label>Permissions</Label>
              {groupedPermissions.map(({ group, items }) => {
                const keys = items.map((i) => i.key);
                return (
                  <div key={group} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">{group}</p>
                      <Button type="button" size="sm" variant="ghost" onClick={() => toggleGroup(keys)}>
                        Toggle all
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((perm) => (
                        <label key={perm.key} className="flex items-start gap-2 rounded-md p-2 hover:bg-slate-50">
                          <Checkbox
                            checked={selectedPermissions.includes(perm.key)}
                            onCheckedChange={() => togglePermission(perm.key)}
                          />
                          <span>
                            <span className="block text-sm font-medium text-slate-800">{perm.label}</span>
                            <span className="block text-xs text-slate-500">{perm.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
