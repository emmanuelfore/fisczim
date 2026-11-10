import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Landmark, ScrollText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface BankingSettingsProps {
  formData: any;
  setFormData: (data: any) => void;
}

export function BankingSettings({
  formData,
  setFormData,
}: BankingSettingsProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Banking Details</h2>
        <p className=" text-muted-foreground">
          This information will appear on your invoices for customer payments
        </p>
      </div>

      <Card className="card-depth border-none max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center text-lg text-emerald-600">
            <Landmark className="w-5 h-5 mr-2" />
            Payment Account Info
          </CardTitle>
          <CardDescription>
            Default bank account for receiving transfers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Bank Name
              </Label>
              <Input
                value={formData.bankName || ""}
                onChange={(e) =>
                  setFormData({ ...formData, bankName: e.target.value })
                }
                placeholder="e.g. Stanbic, CBZ, Ecocash"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Account Name
              </Label>
              <Input
                value={formData.accountName || ""}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
                placeholder="Beneficiary Legal Name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Account Number
              </Label>
              <Input
                value={formData.accountNumber || ""}
                onChange={(e) =>
                  setFormData({ ...formData, accountNumber: e.target.value })
                }
                placeholder="Account #"
                className="h-11 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Branch / Sort Code
              </Label>
              <Input
                value={formData.branchCode || ""}
                onChange={(e) =>
                  setFormData({ ...formData, branchCode: e.target.value })
                }
                placeholder="Branch Code"
                className="h-11 font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-depth border-none max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center text-lg text-indigo-600">
            <ScrollText className="w-5 h-5 mr-2" />
            Invoice Terms &amp; Conditions
          </CardTitle>
          <CardDescription>
            Printed at the bottom of every customer invoice and quotation
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Textarea
            id="invoice-terms"
            value={formData.invoiceTerms || ""}
            onChange={(e) => setFormData({ ...formData, invoiceTerms: e.target.value })}
            placeholder={"1. Deposits are non-refundable once the vehicle has been purchased.\n2. Ownership passes on full payment.\n3. ..."}
            className="min-h-[180px] text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
}
