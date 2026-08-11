import { Card, CardContent } from "@/components/ui/card";
import { Store } from "lucide-react";

// Placeholder per direct product direction - left empty for now,
// scope to be defined later.
export default function VendorsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
        <p className="text-slate-500 text-sm mt-0.5">Subcontractors and suppliers used across tasks.</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" /> Vendors
          </h2>
          <p className="text-sm text-slate-400 mt-2">Coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
