import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, Languages } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";

export function ImportProductDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [originalLanguage, setOriginalLanguage] = useState("zh");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeCompanyId } = useActiveCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Mock translation dictionary for MVP
  const translationDict: Record<string, string> = {
    "USB数据线": "USB Cable",
    "无线鼠标": "Wireless Mouse",
    "苹果手机壳": "Apple Phone Case",
    "笔记本电脑": "Laptop",
    "机械键盘": "Mechanical Keyboard"
  };

  const processAndUpload = async () => {
    if (!file || !activeCompanyId) return;
    setIsUploading(true);

    try {
      // 1. Read Excel/CSV file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });

      if (rows.length < 2) throw new Error("File is empty or missing headers");

      const headers = rows[0] as string[];
      let nameColIdx = headers.findIndex(h => ['Name', 'Product Name', 'Item Name'].includes(h));
      let origNameColIdx = headers.findIndex(h => ['Original Name', 'Foreign Name', 'Supplier Name'].includes(h));
      let origLangColIdx = headers.findIndex(h => ['Original Language', 'Foreign Language'].includes(h));

      // Standardize headers if missing
      if (origNameColIdx === -1) {
        headers.push("Original Name");
        origNameColIdx = headers.length - 1;
      }
      if (origLangColIdx === -1) {
        headers.push("Original Language");
        origLangColIdx = headers.length - 1;
      }
      if (nameColIdx === -1) {
        headers.push("Name");
        nameColIdx = headers.length - 1;
      }

      // 2. Process rows and translate
      let translatedCount = 0;
      const processedRows = rows.slice(1).map((row: any) => {
        const newRow = [...row];
        // Ensure array length matches headers
        while (newRow.length < headers.length) newRow.push("");

        // If auto-translate is on, we assume the provided 'Name' column is actually the foreign name
        // (if they just uploaded a raw Chinese supplier catalog)
        const currentNameValue = newRow[nameColIdx] || "";
        
        if (autoTranslate && currentNameValue) {
          const translated = translationDict[currentNameValue];
          if (translated) {
            newRow[origNameColIdx] = currentNameValue;
            newRow[nameColIdx] = translated;
            translatedCount++;
          } else {
            // Pass-through
            newRow[origNameColIdx] = currentNameValue;
            newRow[nameColIdx] = `[EN] ${currentNameValue}`;
            translatedCount++;
          }
          newRow[origLangColIdx] = originalLanguage;
        }

        return newRow;
      });

      // 3. Convert back to CSV
      const newWorksheet = XLSX.utils.aoa_to_sheet([headers, ...processedRows]);
      const csvOutput = XLSX.utils.sheet_to_csv(newWorksheet);

      // 4. Upload to existing endpoint
      const formData = new FormData();
      const csvBlob = new Blob([csvOutput], { type: 'text/csv' });
      formData.append("file", csvBlob, "processed_catalog.csv");
      formData.append("companyId", activeCompanyId.toString());

      const res = await fetch("/api/import/products", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to import");
      }

      const result = await res.json();
      
      toast({
        title: "Import Successful",
        description: `Imported: ${result.imported || processedRows.length} | Translated: ${translatedCount}`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompanyId, "products"] });
      setOpen(false);
      setFile(null);
    } catch (err: any) {
      toast({
        title: "Import Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" /> Import Catalog
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Supplier Catalog</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div 
            className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv,.xlsx,.xls" 
              onChange={handleFileChange}
            />
            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-4" />
            <div className="font-semibold text-slate-700 mb-1">
              {file ? file.name : "Click to upload Excel/CSV"}
            </div>
            <div className="text-sm text-slate-500">
              Upload your supplier's original product catalog
            </div>
          </div>

          <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-2 font-semibold text-slate-700">
              <Languages className="w-4 h-4" /> Translation Settings
            </div>
            
            <div className="space-y-2">
              <Label>Original Language</Label>
              <Select value={originalLanguage} onValueChange={setOriginalLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto Detect</SelectItem>
                  <SelectItem value="zh">Chinese (Mandarin)</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="autoTranslate" 
                checked={autoTranslate} 
                onCheckedChange={(c) => setAutoTranslate(c as boolean)} 
              />
              <Label htmlFor="autoTranslate" className="text-sm font-normal cursor-pointer">
                Automatically translate product names to English
              </Label>
            </div>
          </div>

          <Button 
            className="w-full" 
            disabled={!file || isUploading} 
            onClick={processAndUpload}
          >
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isUploading ? "Processing..." : "Import Catalog"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
