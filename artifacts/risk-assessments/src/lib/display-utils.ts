export function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
    case 'open':
      return 'default'; // primary color
    case 'completed':
    case 'closed':
    case 'mitigated':
      return 'secondary';
    case 'draft':
      return 'outline';
    case 'archived':
    case 'accepted':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function getRiskLevelColor(level?: string) {
  switch (level) {
    case 'critical':
      return 'bg-red-600 text-white border-red-700';
    case 'high':
      return 'bg-orange-500 text-white border-orange-600';
    case 'medium':
      return 'bg-amber-400 text-black border-amber-500';
    case 'low':
      return 'bg-green-500 text-white border-green-600';
    default:
      return 'bg-slate-200 text-slate-800 border-slate-300';
  }
}

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateStr));
}
