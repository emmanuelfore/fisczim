import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CompleteProductionRunDialogProps {
  companyId: string | number;
  productionRunId: string | number;
  plannedQuantity: string | number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompleteProductionRunDialog({
  companyId,
  productionRunId,
  plannedQuantity,
  open,
  onOpenChange,
}: CompleteProductionRunDialogProps) {
  const [goodQuantity, setGoodQuantity] = useState<string>(plannedQuantity.toString());
  const [rejectedQuantity, setRejectedQuantity] = useState<string>("0");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}/complete`, {
        goodQuantity,
        rejectedQuantity
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs/${productionRunId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/manufacturing/production-runs`] });
      toast({ title: "Success", description: "Production run completed and inventory updated!" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const handleComplete = () => {
    if (!goodQuantity || isNaN(Number(goodQuantity))) {
      toast({ title: "Validation Error", description: "Good Yield Quantity must be a valid number", variant: "destructive" });
      return;
    }
    completeMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Production Run</DialogTitle>
          <DialogDescription>
            Specify the outputs of this production run. Only Good Yield will be placed into stock.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="goodQuantity">Good Yield Quantity (Finished Goods)</Label>
            <Input
              id="goodQuantity"
              type="number"
              step="any"
              value={goodQuantity}
              onChange={(e) => setGoodQuantity(e.target.value)}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="rejectedQuantity">Scrap / Rejected Quantity</Label>
            <Input
              id="rejectedQuantity"
              type="number"
              step="any"
              value={rejectedQuantity}
              onChange={(e) => setRejectedQuantity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Scrap materials consumed will be factored into the variance costs, but will not increase finished good inventory.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={completeMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Completing..." : "Complete Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
