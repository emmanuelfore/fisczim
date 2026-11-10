import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LOST_REASONS } from "@/lib/crm";
import type { CrmStage } from "@/hooks/use-crm";

/**
 * Both ways into a lost deal - dragging the card on the board and picking Lost
 * in the sheet - end up here, because the reason is what the lost-reason
 * analysis in reporting is built from.
 */
export function LostReasonDialog({
  prompt,
  onCancel,
  onConfirm,
  pending,
}: {
  prompt: { enquiryId: number; stage: CrmStage } | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (prompt) setReason("");
  }, [prompt?.enquiryId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Why was this lost?</DialogTitle>
          <DialogDescription>
            A deal cannot be closed lost without a reason - it is what the lost-reason
            report is built from, so pick the one that fits or write your own.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Input
            list="lost-reason-options"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Price too high"
          />
          <datalist id="lost-reason-options">
            {LOST_REASONS.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!reason.trim() || pending} onClick={() => onConfirm(reason.trim())}>
            {pending ? "Saving..." : "Mark lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
