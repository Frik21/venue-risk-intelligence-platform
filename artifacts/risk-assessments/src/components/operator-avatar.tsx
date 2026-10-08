import { cn } from "@/lib/utils";

// Shared initials-avatar convention for a CPO/operator, used anywhere a
// roster needs a quick visual identity instead of a plain name string -
// originally one-off on /admin/cpo-deployment, then duplicated onto the
// Management Dashboard's own refinement pass; pulled out here once a
// second page (Tasks) needed the identical circle so the two couldn't
// drift apart from each other.
export function initialsFor(name: string, avatarInitials?: string | null): string {
  return avatarInitials || name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function OperatorAvatar({
  name,
  avatarInitials,
  size = "sm",
}: {
  name: string;
  avatarInitials?: string | null;
  size?: "sm" | "xs";
}) {
  const dims = size === "xs" ? "w-6 h-6 text-[9px]" : "w-7 h-7 text-[10px]";
  return (
    <div
      title={name}
      className={cn(
        "rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-white",
        dims,
      )}
    >
      {initialsFor(name, avatarInitials)}
    </div>
  );
}

// "+N" overflow chip for a capped avatar stack - same sizing convention
// as OperatorAvatar's own "xs" size, shown in place of the (N+1)th
// avatar once a roster is too long to show every member.
export function OperatorOverflowBadge({ count }: { count: number }) {
  return (
    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center ring-2 ring-white shrink-0">
      +{count}
    </div>
  );
}
