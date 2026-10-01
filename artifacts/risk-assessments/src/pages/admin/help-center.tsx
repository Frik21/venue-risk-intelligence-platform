import { HelpCircle, LifeBuoy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Help Center / FAQ - Platform Maturity Roadmap, Tier 5, item 12.
// Per direct product direction: fixed, hardcoded content, not an
// Owner-editable table/admin UI - a deliberately simpler surface than
// the Owner-editable patterns used elsewhere in this app (pricing,
// seat limits). Beyond the existing "Report an Issue" ticket intake
// (components/report-issue-dialog.tsx), which stays the real support
// channel for anything not answered here - this page exists so a
// subscriber doesn't have to file a ticket and wait just to ask
// something that's already answered.
const FAQ_SECTIONS: { category: string; questions: { q: string; a: string }[] }[] = [
  {
    category: "Getting Started",
    questions: [
      {
        q: "How do I get my company set up?",
        a: "The onboarding checklist on your Management Dashboard walks through the four things a new company needs: add an Office, add a Client, onboard a CPO (under Operator Database), and create a Task. Each step links straight to the right page, and the checklist disappears once all four are done. Want to explore first without using your own real data? The same checklist card has a \"Load sample data\" option that adds a tagged, removable Office/Client/Task/Quote you can click into exactly like the real thing.",
      },
      {
        q: "What's the difference between Command Desk and Operators Note?",
        a: "Command Desk is this app - the full office/admin side used by Managers, Finance, HR, and Operations staff. Operators Note is the separate, full-screen field app your CPOs use on the ground (Check In, Panic, Equipment, After-Action Reports, and more). A Manager can jump into a preview of Operators Note from the sidebar link near the bottom.",
      },
      {
        q: "Who can see what?",
        a: "Manager, Finance, Human Resources, and Operations accounts share the same Command Desk today, with a few role-scoped dashboards (Finance/HR/Operations each land on their own summary page after login) and a small set of locked-down write actions (e.g. only Operations or Manager can change a Task's status). CPOs are a separate, seat-limited pool managed under Operator Database - not Command Desk Users - and only ever see Operators Note.",
      },
    ],
  },
  {
    category: "Seats & Billing",
    questions: [
      {
        q: "How do seats work?",
        a: "Every company gets a free base number of seats per role (Manager, Operations, Finance, Human Resources) plus its own separate CPO seat pool. Once you're past the base, \"+ Additional Seats\" on the Users page lets you add more for any role - the running cost is shown before you confirm.",
      },
      {
        q: "What happens when I buy additional seats?",
        a: "The new seats are available immediately. There's no payment processor connected yet, so buying seats today doesn't generate an actual charge - it's there so you can plan ahead before real billing goes live.",
      },
      {
        q: "Does VenueGuard store my card details?",
        a: "No. VenueGuard never keeps a card on file. Anywhere a card is collected (like at signup), it's used once and not stored - a real charge, once billing is connected, will always ask for card details fresh rather than keeping one saved.",
      },
      {
        q: "What happens at the end of my trial?",
        a: "Your trial period and its end date are shown on your account. Nothing is automatically charged or shut off yet - moving a company from trial to a paid plan is still a manual step on VenueGuard's side while automatic billing is being built.",
      },
    ],
  },
  {
    category: "Safety Features",
    questions: [
      {
        q: "What does the Panic button actually do?",
        a: "Tapping Panic in Operators Note immediately logs a panic signal with the CPO's current location (best effort - it still sends even if location can't be captured) and surfaces it on Command Desk's Alerts page as an unacknowledged Safety Alert, visible to every Management-side user until someone acknowledges it.",
      },
      {
        q: "What if a CPO has no signal when they tap Check In or Panic?",
        a: "Both are queued locally on the device the instant they're tapped and retried automatically once connectivity returns - the CPO sees it as sent right away rather than a failed request. If the server genuinely rejects it (not just a connectivity issue), it's marked failed and shows up for manual retry in the sync-status panel.",
      },
      {
        q: "How do I see check-ins and panic alerts?",
        a: "The Safety Alerts panel at the top of the Alerts page shows every unacknowledged panic or missed scheduled check-in, with an Acknowledge action. It's reachable from the sidebar regardless of which dashboard your role lands on.",
      },
    ],
  },
  {
    category: "Operators & Compliance",
    questions: [
      {
        q: "Where do I onboard a new CPO?",
        a: "Operator Database (not Users) - it's a separate, seat-limited pool from Command Desk's four Management roles. From there you track documents, certifications, pay rates, and approval status.",
      },
      {
        q: "How do I know if a CPO's certification or visa is about to expire?",
        a: "The Expiring Certifications card on Operator Database, the matching stat tiles on the Human Resources dashboard, and the Compliance page all flag anything inside a 30-day window - already-expired items sort to the top.",
      },
      {
        q: "What's the Compliance page for?",
        a: "It's a single cross-cutting view of everything that needs attention company-wide: expiring/expired certifications, pending onboarding, unapproved timesheets, and unreviewed field incident reports - each links straight to its real page to act on it.",
      },
    ],
  },
  {
    category: "Data & Your Account",
    questions: [
      {
        q: "Can I export my company's data?",
        a: "Yes - Data Export in the sidebar downloads a single JSON file with your company's Clients, Vendors, Tasks, Quotes, Invoices, Contracts, team roster, and Offices. It's scoped strictly to your own company and never includes anyone else's data.",
      },
      {
        q: "I forgot my password - what do I do?",
        a: "Use \"Forgot password?\" on the login page. You'll get a reset link tied to your account that expires after use.",
      },
      {
        q: "Is my data private from other subscribers?",
        a: "Yes - every piece of data in VenueGuard is scoped to your own company at the database level. No other subscriber, and no VenueGuard staff account outside the platform Owner, can see your records.",
      },
    ],
  },
  {
    category: "Still Stuck?",
    questions: [
      {
        q: "This didn't answer my question - what now?",
        a: "Use \"Report an Issue\" in the sidebar (or the operator menu in Operators Note) to send a real support ticket straight to VenueGuard. Include what you were trying to do and what happened instead, and it'll be picked up from there.",
      },
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-slate-400" /> Help Center
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Answers to common questions about using VenueGuard.</p>
      </div>

      {FAQ_SECTIONS.map((section) => (
        <Card key={section.category}>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">{section.category}</h2>
            <Accordion type="multiple">
              {section.questions.map((item, i) => (
                <AccordionItem key={i} value={`${section.category}-${i}`}>
                  <AccordionTrigger className="text-sm text-left">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-slate-600">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <LifeBuoy className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        Can't find what you're looking for? Use "Report an Issue" in the sidebar to reach VenueGuard support directly.
      </p>
    </div>
  );
}
