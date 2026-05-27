import { Layout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useBusConductors, useCreateBusConductor } from "@/hooks/use-bus-ticketing";
import { Loader2, UserPlus, Users } from "lucide-react";
import { useState } from "react";

export default function BusConductorsPage() {
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { toast } = useToast();
  const { data: conductors = [], isLoading } = useBusConductors(companyId);
  const createConductor = useCreateBusConductor();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("Zimra123!");

  async function addConductor() {
    try {
      await createConductor.mutateAsync({ companyId, name, email, username, password });
      toast({ title: "Conductor added", description: `${name || email} can now sign in to the mobile app.` });
      setOpen(false);
      setName("");
      setEmail("");
      setUsername("");
      setPassword("Zimra123!");
    } catch (error: any) {
      toast({ title: "Could not add conductor", description: error.message, variant: "destructive" });
    }
  }

  return (
    <Layout>
      <PageHeader
        title="Bus Conductors"
        subtitle="Create conductor logins for the mobile ticketing app"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Conductor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Conductor</DialogTitle>
                <DialogDescription>This creates a cashier-level mobile login for issuing bus tickets.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Full name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Tawanda Moyo" />
                </div>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="conductor@example.com" />
                </div>
                <div className="grid gap-2">
                  <Label>Username</Label>
                  <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="tawanda" />
                </div>
                <div className="grid gap-2">
                  <Label>Initial password</Label>
                  <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={addConductor} disabled={!email || createConductor.isPending}>
                  {createConductor.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-orange-500" />
            Conductors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500">Loading conductors...</TableCell></TableRow>
              ) : conductors.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-slate-500">No conductors added yet.</TableCell></TableRow>
              ) : conductors.map((conductor: any) => (
                <TableRow key={conductor.id}>
                  <TableCell className="font-semibold">{conductor.name || "-"}</TableCell>
                  <TableCell>{conductor.email}</TableCell>
                  <TableCell>{conductor.username || "-"}</TableCell>
                  <TableCell className="capitalize">{conductor.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
