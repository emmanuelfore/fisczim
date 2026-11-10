import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/page-skeleton";
import {
  useCreateStage,
  useDeleteStage,
  useUpdateStage,
  type CrmStage,
} from "@/hooks/use-crm";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { COLOR_NAMES, stageColor } from "@/lib/crm";
import { Archive, ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert } from "lucide-react";

/**
 * Pipeline configuration, the Odoo "Stages" screen. Probability is what the
 * board multiplies expected revenue by, and the won/lost flags are what turn an
 * enquiry's derived status open -> won|lost, so both stay editable here and the
 * server re-derives status for everything in the stage.
 */
export function StagesDialog({
  companyId,
  stages,
  error,
  onRetry,
  open,
  onOpenChange,
}: {
  companyId: number;
  stages: CrmStage[];
  error?: Error | null;
  onRetry?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const updateStage = useUpdateStage(companyId);
  const createStage = useCreateStage(companyId);
  const deleteStage = useDeleteStage(companyId);
  const [newName, setNewName] = useState("");

  const manage = can("crm.stages.manage");
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);

  const fail = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const move = (stage: CrmStage, direction: -1 | 1) => {
    const index = ordered.findIndex((s) => s.id === stage.id);
    const neighbour = ordered[index + direction];
    if (!neighbour) return;
    // Two writes: swap the sequence numbers. The board re-sorts on refetch.
    updateStage.mutate({ id: stage.id, sequence: neighbour.sequence }, { onError: fail });
    updateStage.mutate({ id: neighbour.id, sequence: stage.sequence }, { onError: fail });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pipeline stages</DialogTitle>
          <DialogDescription>
            Every company starts with New, Contacted, Qualified, Proposal, Won and Lost. Rename or
            reorder them to match how your sales floor actually works.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <TriangleAlert className="h-8 w-8 text-rose-500" />
            <div>
              <p className="text-sm font-medium text-slate-700">The stages could not be loaded</p>
              <p className="mt-1 text-xs text-slate-500">{error.message}</p>
            </div>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        ) : !stages.length ? (
          <LoadingRows />
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_90px_110px_70px_78px_150px] gap-2 px-1 text-xs font-medium text-slate-500">
              <span>Stage</span>
              <span>Prob. %</span>
              <span>Colour</span>
              <span>Won</span>
              <span>Lost</span>
              <span className="text-right">Order</span>
            </div>

            {ordered.map((stage) => {
              const disabled = stage.isActive === false;
              return (
                <div
                  key={stage.id}
                  className={`grid grid-cols-[1fr_90px_110px_70px_78px_150px] items-center gap-2 rounded-lg border border-slate-100 p-2 ${
                    disabled ? "opacity-50" : ""
                  }`}
                >
                  <Input
                    defaultValue={stage.name}
                    disabled={!manage}
                    className="h-9"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== stage.name) updateStage.mutate({ id: stage.id, name: value }, { onError: fail });
                    }}
                  />
                  <Input
                    type="number"
                    defaultValue={stage.probability}
                    disabled={!manage}
                    className="h-9"
                    onBlur={(e) => {
                      const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      if (value !== stage.probability) updateStage.mutate({ id: stage.id, probability: value }, { onError: fail });
                    }}
                  />
                  <Select
                    value={stage.color || "slate"}
                    onValueChange={(color) => updateStage.mutate({ id: stage.id, color }, { onError: fail })}
                    disabled={!manage}
                  >
                    <SelectTrigger className="h-9">
                      <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${stageColor(stage.color).bar}`} />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_NAMES.map((name) => (
                        <SelectItem key={name} value={name}>
                          <span className="flex items-center gap-2 capitalize">
                            <span className={`h-2.5 w-2.5 rounded-full ${stageColor(name).bar}`} />
                            {name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-center">
                    <Switch
                      checked={stage.isWon}
                      disabled={!manage}
                      onCheckedChange={(isWon) => updateStage.mutate({ id: stage.id, isWon, isLost: isWon ? false : stage.isLost }, { onError: fail })}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={stage.isLost}
                      disabled={!manage}
                      onCheckedChange={(isLost) => updateStage.mutate({ id: stage.id, isLost, isWon: isLost ? false : stage.isWon }, { onError: fail })}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manage} onClick={() => move(stage, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!manage} onClick={() => move(stage, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400"
                      disabled={!manage || deleteStage.isPending}
                      title="Delete, or archive if enquiries still sit in this stage"
                      onClick={() =>
                        deleteStage.mutate(stage.id, {
                          onSuccess: (result: any) =>
                            toast({
                              title: result?.archived
                                ? "Stage archived"
                                : `Still holding ${result?.inUse ?? 0} enquiries`,
                              description: result?.archived
                                ? "Hidden from the board; existing enquiries keep it."
                                : "It had no enquiries, so it was removed.",
                            }),
                          onError: fail,
                        })
                      }
                    >
                      {deleteStage.isPending ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}

            {manage ? (
              <div className="flex items-center gap-2 pt-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New stage name"
                  className="h-9"
                />
                <Button
                  variant="outline"
                  disabled={!newName.trim() || createStage.isPending}
                  onClick={() =>
                    createStage.mutate(
                      {
                        name: newName.trim(),
                        sequence: (ordered[ordered.length - 1]?.sequence ?? -1) + 1,
                        probability: 50,
                        isWon: false,
                        isLost: false,
                        color: "sky",
                        companyId,
                      } as Partial<CrmStage>,
                      {
                        onSuccess: () => {
                          setNewName("");
                          toast({ title: "Stage added" });
                        },
                        onError: fail,
                      },
                    )
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Add stage
                </Button>
              </div>
            ) : (
              <Badge variant="secondary" className="mt-2 w-fit">
                Read-only - configuring stages needs the CRM stage permission
              </Badge>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
