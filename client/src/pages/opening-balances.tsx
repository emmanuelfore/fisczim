import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Account } from "@shared/schema";
import { format } from "date-fns";
import { Lock, Upload, AlertCircle, CheckCircle2, FileSpreadsheet, Download } from "lucide-react";
import { useState, useRef } from "react";
import Papa from "papaparse";

type OpeningState = {
  locked: boolean;
  date?: string | null;
  journalEntryId?: number | null;
  customerSubledgerDocs?: Array<any>;
  supplierSubledgerDocs?: Array<any>;
};

type ParsedData = {
  lines: { accountId: number; accountCode: string; debit: number; credit: number; name?: string }[];
  customers: { name: string; amount: number }[];
  suppliers: { name: string; amount: number }[];
  inventoryValue: number;
  totalDebit: number;
  totalCredit: number;
  errors: string[];
};

export default function OpeningBalancesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts"],
  });
  const { data: opening } = useQuery<OpeningState>({
    queryKey: ["/api/accounting/opening-balances"],
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const lines: ParsedData["lines"] = [];
        const customers: ParsedData["customers"] = [];
        const suppliers: ParsedData["suppliers"] = [];
        let inventoryValue = 0;
        
        let totalDebit = 0;
        let totalCredit = 0;

        results.data.forEach((row: any, index) => {
          const type = (row.Type || "").toString().trim().toUpperCase();
          const code = (row["Account Code"] || row.Code || "").toString().trim();
          const name = (row["Account/Entity Name"] || row.Name || "").toString().trim();
          const debitStr = (row.Debit || "0").toString().replace(/,/g, '');
          const creditStr = (row.Credit || "0").toString().replace(/,/g, '');
          const debit = parseFloat(debitStr) || 0;
          const credit = parseFloat(creditStr) || 0;
          
          if (!type) {
            errors.push(`Row ${index + 2}: Missing Type.`);
            return;
          }

          if (["GL", "GENERAL LEDGER", "TRIAL BALANCE"].includes(type)) {
            const account = accounts.find((a) => a.code === code);
            if (!account) {
              errors.push(`Row ${index + 2}: Account code "${code}" not found.`);
            } else {
              if (debit > 0 && credit > 0) {
                errors.push(`Row ${index + 2}: Cannot have both debit and credit.`);
              } else {
                lines.push({ accountId: account.id, accountCode: account.code, debit, credit, name: account.name });
                totalDebit += debit;
                totalCredit += credit;
              }
            }
          } else if (type === "CUSTOMER") {
            if (!name) errors.push(`Row ${index + 2}: Missing Customer Name.`);
            else {
              const amount = debit > 0 ? debit : credit;
              customers.push({ name, amount });
              totalDebit += amount;
            }
          } else if (type === "SUPPLIER") {
            if (!name) errors.push(`Row ${index + 2}: Missing Supplier Name.`);
            else {
              const amount = credit > 0 ? credit : debit;
              suppliers.push({ name, amount });
              totalCredit += amount;
            }
          } else if (type === "INVENTORY") {
            const amount = debit > 0 ? debit : credit;
            inventoryValue += amount;
            totalDebit += amount;
          } else {
            errors.push(`Row ${index + 2}: Unknown Type "${type}". Expected GL, CUSTOMER, SUPPLIER, or INVENTORY.`);
          }
        });

        setParsedData({ lines, customers, suppliers, inventoryValue, totalDebit, totalCredit, errors });
        // Reset file input so same file can be uploaded again if needed
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        toast({
          title: "Error parsing CSV",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "Type,Account Code,Name,Debit,Credit\nGL,1000,Cash On Hand,5000.00,0\nCUSTOMER,,John Doe,1500.00,0\nSUPPLIER,,Acme Corp,0,2000.00\nINVENTORY,,,3000.00,0\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "opening_balances_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const postMutation = useMutation({
    mutationFn: async () => {
      if (!parsedData || parsedData.errors.length > 0) {
        throw new Error("Cannot post invalid data.");
      }
      
      const payload = {
        date,
        trialBalanceLines: parsedData.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
        })),
        customerBalances: parsedData.customers,
        supplierBalances: parsedData.suppliers,
        inventoryValue: parsedData.inventoryValue,
      };
      
      const res = await apiRequest("POST", "/api/accounting/opening-balances", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Opening balances posted",
        description: "The opening entry is locked and available in the audit trail.",
      });
      setParsedData(null);
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/journal"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/trial-balance"] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not post opening balances",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Layout hideHeaderTitle>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 font-display">
              Opening Balances Import
            </h2>
            <p className=" text-slate-500">
              Import your opening trial balance, customer/supplier balances via CSV.
            </p>
          </div>
          {opening?.locked ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Lock className="mr-1 h-3.5 w-3.5" />
              Locked journal #{opening.journalEntryId}
            </Badge>
          ) : null}
        </div>

        {opening?.locked ? (
          <Card>
            <CardHeader>
              <CardTitle>Opening Balance Lock</CardTitle>
            </CardHeader>
            <CardContent className=" text-slate-600">
              Opening balances were posted on{" "}
              {opening.date ? format(new Date(opening.date), "PPP") : "the selected date"}
              . Reverse journal #{opening.journalEntryId} from the audit trail to unlock and repost.
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-bold text-slate-800">Receivables subledger</p>
                  <p className="text-xs text-slate-500">
                    {opening.customerSubledgerDocs?.length || 0} opening customer invoice
                    {(opening.customerSubledgerDocs?.length || 0) === 1 ? "" : "s"} created.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-bold text-slate-800">Payables subledger</p>
                  <p className="text-xs text-slate-500">
                    {opening.supplierSubledgerDocs?.length || 0} opening supplier bill
                    {(opening.supplierSubledgerDocs?.length || 0) === 1 ? "" : "s"} created.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" /> Import CSV File
                </CardTitle>
                <CardDescription>
                  Upload a CSV file containing your opening balances. Ensure it follows the template format.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-xs space-y-2 mb-6">
                  <Label>Opening balance date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  <div className="flex-1 w-full border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                    <FileSpreadsheet className="h-8 w-8 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 mb-4">Drag and drop your CSV file here, or click to browse</p>
                    <Label htmlFor="csv-upload" className="cursor-pointer">
                      <div className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                        <Upload className="mr-2 h-4 w-4" /> Browse CSV
                      </div>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                      />
                    </Label>
                  </div>
                  <div className="flex-none">
                    <Button variant="outline" onClick={downloadTemplate}>
                      <Download className="mr-2 h-4 w-4" /> Download Template
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {parsedData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Dry Run Preview
                  </CardTitle>
                  <CardDescription>
                    Review the imported data before posting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {parsedData.errors.length > 0 ? (
                    <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-100">
                      <div className="flex items-center gap-2 mb-2 font-bold">
                        <AlertCircle className="h-5 w-5" /> Validation Errors Found
                      </div>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {parsedData.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                      <p className="mt-4 text-sm font-medium">Please fix these errors in your CSV and re-upload.</p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg border border-emerald-100 flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-5 w-5" /> All rows parsed and validated successfully.
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-slate-500 mb-1">GL Lines</div>
                      <div className="text-2xl font-bold">{parsedData.lines.length}</div>
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-slate-500 mb-1">Customers</div>
                      <div className="text-2xl font-bold">{parsedData.customers.length}</div>
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-slate-500 mb-1">Suppliers</div>
                      <div className="text-2xl font-bold">{parsedData.suppliers.length}</div>
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-slate-500 mb-1">Inventory Value</div>
                      <div className="text-2xl font-bold">{parsedData.inventoryValue.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="border-t pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="font-bold text-slate-800">
                        Total Debit: {parsedData.totalDebit.toFixed(2)}
                      </span>
                      <span className="mx-3 text-slate-300">|</span>
                      <span className="font-bold text-slate-800">
                        Total Credit: {parsedData.totalCredit.toFixed(2)}
                      </span>
                      <span className="mx-3 text-slate-300">|</span>
                      <span className="text-slate-500 text-sm">
                        Difference {(parsedData.totalDebit - parsedData.totalCredit).toFixed(2)} will post to opening equity.
                      </span>
                    </div>
                    <Button
                      disabled={parsedData.errors.length > 0 || postMutation.isPending || (parsedData.lines.length === 0 && parsedData.customers.length === 0 && parsedData.suppliers.length === 0 && parsedData.inventoryValue === 0)}
                      onClick={() => postMutation.mutate()}
                    >
                      <Lock className="mr-2 h-4 w-4" /> Post and Lock Opening Balances
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
