import { useState } from "react";
import { enqueueOfflineSubmission } from "@/lib/offline-queue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Adding an equipment item to a task's ad-hoc issue/return checklist -
// Following Roadmap, Tier 2 item 14. Same offline-queue submission
// pattern as Handover Notes/After-Action Report - a pure append, so it
// queues cleanly even offline. Issuing/returning an already-added item
// isn't offline-queued (those act on a specific existing row, which a
// still-pending offline add wouldn't have yet) - a CPO doing that needs
// connectivity, same as "Nearby Help".
export function AddEquipmentDialog({ taskId, taskTitle, onClose }: { taskId: number; taskTitle: string; onClose: () => void }) {
  const { toast } = useToast();
  const [itemName, setItemName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function submit() {
    if (!itemName.trim()) return;
    setSubmitting(true);
    enqueueOfflineSubmission("equipment", {
      taskId,
      itemName: itemName.trim(),
      serialNumber: serialNumber.trim() || undefined,
    });
    toast({ title: "Equipment item added", description: "It's queued and will sync to your Command Desk automatically." });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-xl shadow-2xl w-full max-w-md my-8 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Add Equipment</h2>
          <p className="text-xs text-slate-500 mt-0.5">{taskTitle}</p>
        </div>
        <div>
          <Label>Item *</Label>
          <Input placeholder="e.g. Radio, vehicle keys, body cam" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </div>
        <div>
          <Label>Serial Number</Label>
          <Input placeholder="Optional" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button onClick={submit} disabled={submitting || !itemName.trim()}>Add Item</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
