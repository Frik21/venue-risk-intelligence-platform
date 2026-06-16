export function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'approved': case 'monitoring': return 'default';
    case 'under_review': return 'secondary';
    case 'draft': return 'outline';
    case 'review_required': case 'escalated': return 'destructive';
    case 'archived': return 'secondary';
    default: return 'outline';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'draft': return 'text-slate-500 bg-slate-100 border-slate-200';
    case 'under_review': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'approved': return 'text-green-700 bg-green-50 border-green-200';
    case 'monitoring': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'review_required': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'escalated': return 'text-red-700 bg-red-50 border-red-200';
    case 'archived': return 'text-slate-500 bg-slate-100 border-slate-200';
    default: return 'text-slate-500 bg-slate-100 border-slate-200';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'under_review': return 'Under Review';
    case 'approved': return 'Approved';
    case 'monitoring': return 'Monitoring';
    case 'review_required': return 'Review Required';
    case 'escalated': return 'Escalated';
    case 'archived': return 'Archived';
    default: return status;
  }
}

export function getRiskRatingColor(rating?: string | null): string {
  switch (rating) {
    case 'high': return 'text-red-700 bg-red-50 border-red-200';
    case 'moderate_high': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'moderate': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'low': return 'text-green-700 bg-green-50 border-green-200';
    default: return 'text-slate-500 bg-slate-100 border-slate-200';
  }
}

export function getRiskRatingLabel(rating?: string | null): string {
  switch (rating) {
    case 'high': return 'HIGH';
    case 'moderate_high': return 'MOD-HIGH';
    case 'moderate': return 'MODERATE';
    case 'low': return 'LOW';
    default: return 'UNKNOWN';
  }
}

export function getRiskLevelColor(level?: string): string {
  switch (level) {
    case 'critical': return 'bg-red-600 text-white border-red-700';
    case 'high': return 'bg-orange-500 text-white border-orange-600';
    case 'medium': return 'bg-amber-400 text-black border-amber-500';
    case 'low': return 'bg-green-500 text-white border-green-600';
    default: return 'bg-slate-200 text-slate-800 border-slate-300';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return 'text-red-700 bg-red-50 border-red-300';
    case 'high': return 'text-orange-700 bg-orange-50 border-orange-300';
    case 'medium': return 'text-amber-700 bg-amber-50 border-amber-300';
    case 'low': return 'text-green-700 bg-green-50 border-green-300';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-700 bg-red-50 border-red-300';
    case 'high': return 'text-orange-700 bg-orange-50 border-orange-300';
    case 'medium': return 'text-amber-700 bg-amber-50 border-amber-300';
    case 'low': return 'text-green-700 bg-green-50 border-green-300';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
}

export function getRouteTypeColor(routeType: string): string {
  switch (routeType) {
    case 'primary_extraction': return '#2563eb';   // blue
    case 'secondary_extraction': return '#7c3aed'; // purple
    case 'medical_evacuation': return '#dc2626';   // red
    case 'vip_arrival': return '#16a34a';          // green
    case 'vip_departure': return '#059669';        // emerald
    case 'staff_access': return '#d97706';         // amber
    case 'supplier_route': return '#64748b';       // slate
    case 'emergency_access': return '#ea580c';     // orange
    default: return '#64748b';
  }
}

export function getRouteTypeLabel(routeType: string): string {
  switch (routeType) {
    case 'primary_extraction': return 'Primary Extraction';
    case 'secondary_extraction': return 'Secondary Extraction';
    case 'medical_evacuation': return 'Medical Evacuation';
    case 'vip_arrival': return 'VIP Arrival';
    case 'vip_departure': return 'VIP Departure';
    case 'staff_access': return 'Staff Access';
    case 'supplier_route': return 'Supplier / Service';
    case 'emergency_access': return 'Emergency Services';
    default: return routeType.replace(/_/g, ' ');
  }
}

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr));
}

export function formatDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export function formatDistance(metres: number | null): string {
  if (!metres) return '—';
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

export function formatTravelTime(minutes: number | null): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export const VENUE_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'stadium', label: 'Stadium' },
  { value: 'conference', label: 'Conference Centre' },
  { value: 'embassy', label: 'Embassy' },
  { value: 'airport', label: 'Airport' },
  { value: 'mall', label: 'Shopping Mall' },
  { value: 'government', label: 'Government Building' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'university', label: 'University' },
  { value: 'other', label: 'Other' },
];

export const ENVIRONMENT_TYPES = [
  { value: 'urban', label: 'Urban' },
  { value: 'suburban', label: 'Suburban' },
  { value: 'rural', label: 'Rural' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'coastal', label: 'Coastal' },
];

export const RISK_RATINGS = [
  { value: 'low', label: 'Low', color: 'text-green-700' },
  { value: 'moderate', label: 'Moderate', color: 'text-amber-700' },
  { value: 'moderate_high', label: 'Moderate–High', color: 'text-orange-700' },
  { value: 'high', label: 'High', color: 'text-red-700' },
  { value: 'unknown', label: 'Unknown', color: 'text-slate-500' },
];

export const ASSESSMENT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'review_required', label: 'Review Required' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'archived', label: 'Archived' },
];

export const INCIDENT_TYPES = [
  { value: 'crime', label: 'Crime' },
  { value: 'violent_crime', label: 'Violent Crime' },
  { value: 'property_crime', label: 'Property Crime' },
  { value: 'armed_robbery', label: 'Armed Robbery' },
  { value: 'assault', label: 'Assault' },
  { value: 'vehicle_theft', label: 'Vehicle Theft' },
  { value: 'protest', label: 'Protest' },
  { value: 'demonstration', label: 'Demonstration' },
  { value: 'riot', label: 'Riot' },
  { value: 'civil_unrest', label: 'Civil Unrest' },
  { value: 'road_closure', label: 'Road Closure' },
  { value: 'police_advisory', label: 'Police Advisory' },
  { value: 'government_alert', label: 'Government Alert' },
  { value: 'news', label: 'News Incident' },
];

export const EVIDENCE_TYPES = [
  { value: 'osint_source', label: 'OSINT Source' },
  { value: 'analyst_note', label: 'Analyst Note' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'PDF Document' },
  { value: 'website', label: 'Website' },
  { value: 'news_article', label: 'News Article' },
  { value: 'police_advisory', label: 'Police Advisory' },
  { value: 'government_bulletin', label: 'Government Bulletin' },
  { value: 'map_screenshot', label: 'Map Screenshot' },
];

export const ROUTE_TYPES = [
  { value: 'primary_extraction', label: 'Primary Extraction Route', color: '#2563eb' },
  { value: 'secondary_extraction', label: 'Secondary Extraction Route', color: '#7c3aed' },
  { value: 'medical_evacuation', label: 'Medical Evacuation Route', color: '#dc2626' },
  { value: 'vip_arrival', label: 'VIP Arrival Route', color: '#16a34a' },
  { value: 'vip_departure', label: 'VIP Departure Route', color: '#059669' },
  { value: 'staff_access', label: 'Staff Access Route', color: '#d97706' },
  { value: 'supplier_route', label: 'Supplier / Service Route', color: '#64748b' },
  { value: 'emergency_access', label: 'Emergency Services Access', color: '#ea580c' },
];

export const ROUTE_CREATION_METHODS = [
  { value: 'endpoint_marker', label: 'Endpoint Marker (click map)', description: 'Click start and end points on the map' },
  { value: 'street_builder', label: 'Street Name Builder', description: 'Enter road names in sequence' },
  { value: 'freehand_draw', label: 'Freehand Draw', description: 'Click multiple points to trace the route' },
];

export const ROUTE_CONSTRAINTS = [
  'Traffic congestion', 'Road closures', 'Protest activity', 'Construction',
  'Narrow roads', 'One-way streets', 'Limited turning space', 'Security exposure points',
  'Poor lighting', 'High pedestrian density', 'Ride-share clustering', 'Limited law enforcement presence',
];
