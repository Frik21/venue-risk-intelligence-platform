import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ShieldAlert, ShieldCheck, Gauge, ArrowLeft, X, CreditCard } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { CardCvcElement, CardExpiryElement, CardNumberElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { api, MANAGEMENT_HOME_ROUTE, type PlanType, type ManagementRole } from "@/lib/api";

// Same four roles/labels as Command Desk's own "Add User" dialog
// (pages/admin/users.tsx) - "Position" on the signup form is really
// just picking which of those the person signing up is.
const POSITIONS: { value: ManagementRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "finance", label: "Finance" },
  { value: "human_resources", label: "Human Resources" },
  { value: "operations", label: "Operations" },
];

// Two display-label-only names, "Solo Operator" and "Management
// system" - per direct product direction ("when you click register it
// needs to give me the option to select 'Solo Operator' or
// 'Management system'"). "Management system" is a signup-flow-only
// label for the "team" plan (the internal planType value, route
// names, and every other surface's own "Team" label are unchanged -
// same display-label-vs-identifier split as Command Desk/Operators
// note elsewhere in this app).
const PLAN_CHOICES: { value: PlanType; label: string; description: string; icon: typeof ShieldCheck }[] = [
  {
    value: "solo_operator",
    label: "Solo Operator",
    description: "Just you, a freelance CPO - Operators Note only, no Management side.",
    icon: ShieldCheck,
  },
  {
    value: "team",
    label: "Management system",
    description: "Full Command Desk + Operators Note for your whole team.",
    icon: Gauge,
  },
];

// Styled to sit inside this page's own dark inputs (bg-slate-950,
// slate-500 placeholder) - Stripe Elements render into an iframe, so
// this can't be done with Tailwind classes, only Stripe's own style API.
const STRIPE_ELEMENT_STYLE = {
  base: { color: "#fff", fontSize: "14px", "::placeholder": { color: "#64748b" } },
  invalid: { color: "#f87171" },
};
const stripeElementBoxClass = "flex h-9 w-full items-center rounded-md border border-slate-800 bg-slate-950 px-3";

// Real Stripe card collection, rendered only once a Stripe account is
// actually connected (see the StripeConfig check below) - only usable
// inside an <Elements> provider, which is why this is split out from
// PaymentPanel rather than inlined. Validates the card via the
// SetupIntent PaymentPanel already created (clientSecret) without
// charging or saving it - see lib/stripe.ts's own comment on why no
// Customer/PaymentMethod is ever persisted, and CLAUDE.md's standing
// "never keep card details on file" rule.
function StripeCardForm({
  clientSecret,
  monthlyPrice,
  planLabel,
  onSaved,
}: {
  clientSecret: string;
  monthlyPrice: number | undefined;
  planLabel: string;
  onSaved: (setupIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [cardName, setCardName] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleSave = async () => {
    if (!stripe || !elements) return;
    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) return;
    setCardError(null);
    setConfirming(true);
    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardNumberElement, billing_details: { name: cardName || undefined } },
    });
    setConfirming(false);
    if (error || !setupIntent || setupIntent.status !== "succeeded") {
      setCardError(error?.message ?? "Card validation failed - please try again.");
      return;
    }
    toast({ title: "Card validated" });
    onSaved(setupIntent.id);
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <Label className="text-slate-300">Name on Card</Label>
          <Input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Full name" className="bg-slate-950 border-slate-800 text-white mt-1" />
        </div>
        <div>
          <Label className="text-slate-300">Card Number</Label>
          <div className={`${stripeElementBoxClass} mt-1`}>
            <CardNumberElement options={{ style: STRIPE_ELEMENT_STYLE }} className="w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-slate-300">Expiry</Label>
            <div className={`${stripeElementBoxClass} mt-1`}>
              <CardExpiryElement options={{ style: STRIPE_ELEMENT_STYLE }} className="w-full" />
            </div>
          </div>
          <div>
            <Label className="text-slate-300">CVC</Label>
            <div className={`${stripeElementBoxClass} mt-1`}>
              <CardCvcElement options={{ style: STRIPE_ELEMENT_STYLE }} className="w-full" />
            </div>
          </div>
        </div>
      </div>
      {cardError && <p className="text-sm text-red-400 mt-3">{cardError}</p>}
      <Button type="button" className="w-full mt-6" disabled={!stripe || confirming} onClick={handleSave}>
        {confirming ? "Validating..." : `Save Card${monthlyPrice != null ? ` - $${monthlyPrice}/mo` : ""}`}
      </Button>
      <p className="text-xs text-slate-600 mt-2 text-center">
        Validated for {planLabel} via Stripe - nothing is charged, and your card details are never stored by VenueGuard.
      </p>
    </>
  );
}

// Non-functional stub, shown until a real Stripe account is connected
// (see the StripeConfig check below) - card-detail-shaped fields that
// are never read into state or sent anywhere. Mirrors Command Desk's
// own seat-purchase "Buy" button pattern (AdditionalSeatsDialog): same
// amber "no payment processor connected yet" disclaimer, same
// apply-then-confirm UX, just with nothing real underneath yet.
function StubCardForm({ monthlyPrice, onSaved }: { monthlyPrice: number | undefined; onSaved: () => void }) {
  const { toast } = useToast();
  return (
    <>
      <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg p-3 mb-5">
        No payment processor is connected yet - Save Card applies no actual charge.
      </div>
      <div className="space-y-4">
        <div>
          <Label className="text-slate-300">Name on Card</Label>
          <Input placeholder="Full name" className="bg-slate-950 border-slate-800 text-white mt-1" />
        </div>
        <div>
          <Label className="text-slate-300">Card Number</Label>
          <Input placeholder="1234 1234 1234 1234" autoComplete="cc-number" className="bg-slate-950 border-slate-800 text-white mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-slate-300">Expiry</Label>
            <Input placeholder="MM/YY" autoComplete="cc-exp" className="bg-slate-950 border-slate-800 text-white mt-1" />
          </div>
          <div>
            <Label className="text-slate-300">CVC</Label>
            <Input placeholder="123" autoComplete="cc-csc" className="bg-slate-950 border-slate-800 text-white mt-1" />
          </div>
        </div>
      </div>
      <Button
        type="button"
        className="w-full mt-6"
        onClick={() => {
          onSaved();
          toast({ title: "Payment method saved" });
        }}
      >
        {`Save Card${monthlyPrice != null ? ` - $${monthlyPrice}/mo` : ""}`}
      </Button>
    </>
  );
}

function PaymentPanel({
  monthlyPrice,
  planLabel,
  stripeEnabled,
  stripePromise,
  onClose,
  onSaved,
}: {
  monthlyPrice: number | undefined;
  planLabel: string;
  stripeEnabled: boolean;
  stripePromise: ReturnType<typeof loadStripe> | null;
  onClose: () => void;
  onSaved: (setupIntentId?: string) => void;
}) {
  // Started fresh every time the panel opens - a SetupIntent is single-
  // use, and re-fetching here means a subscriber who backs out and
  // re-opens the panel always validates against a live one.
  const { data: setupIntent } = useQuery({
    queryKey: ["stripe-setup-intent"],
    queryFn: api.auth.createStripeSetupIntent,
    enabled: stripeEnabled,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Payment Details</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          {monthlyPrice != null ? `$${monthlyPrice}/month` : "..."} - {planLabel}
        </p>

        {stripeEnabled && stripePromise && setupIntent ? (
          <Elements stripe={stripePromise} options={{ clientSecret: setupIntent.clientSecret }}>
            <StripeCardForm
              clientSecret={setupIntent.clientSecret}
              monthlyPrice={monthlyPrice}
              planLabel={planLabel}
              onSaved={(setupIntentId) => onSaved(setupIntentId)}
            />
          </Elements>
        ) : stripeEnabled ? (
          <p className="text-sm text-slate-500">Starting secure card validation...</p>
        ) : (
          <StubCardForm monthlyPrice={monthlyPrice} onSaved={() => onSaved()} />
        )}
      </div>
    </>
  );
}

export default function RegisterPage() {
  const { user, register } = useAuth();
  const isOwnerTesting = user?.role === "admin";
  const [, navigate] = useLocation();
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<ManagementRole>("manager");
  const [officeCity, setOfficeCity] = useState("");
  const [officeCountry, setOfficeCountry] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToPrice, setAgreedToPrice] = useState(false);
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);
  const [stripeSetupIntentId, setStripeSetupIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Base subscription price, shown just above Register so the person
  // signing up sees what they're committing to before the account is
  // created - per direct product direction. Unauthenticated endpoint
  // (routes/auth.ts's GET /auth/pricing) since no session/company
  // exists yet at this point; always USD for the same reason (no office
  // yet for the currency engine to derive a local currency from).
  const { data: pricing } = useQuery({ queryKey: ["auth-pricing"], queryFn: api.auth.pricing });

  // Real Stripe capability, built now and connected later (see
  // lib/stripe.ts on the backend) - whether a live Stripe account is
  // actually configured is asked fresh at runtime, so this page needs no
  // rebuild once STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY are set.
  // Until then, stripeEnabled is false and the panel falls back to the
  // existing non-functional stub.
  const { data: stripeConfig } = useQuery({ queryKey: ["stripe-config"], queryFn: api.auth.stripeConfig });
  const stripeEnabled = stripeConfig?.enabled ?? false;
  const stripePromise = useMemo(
    () => (stripeConfig?.enabled && stripeConfig.publishableKey ? loadStripe(stripeConfig.publishableKey) : null),
    [stripeConfig],
  );

  const isSolo = planType === "solo_operator";
  const monthlyPrice = isSolo ? pricing?.soloOperatorMonthlyPrice : pricing?.baseMonthlyPrice;
  const canSubmit =
    (isSolo || companyName.trim()) &&
    name.trim() &&
    email.trim() &&
    password.length >= 8 &&
    agreedToPrice &&
    (!stripeEnabled || cardSaved);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planType) return;
    setError(null);
    setSubmitting(true);
    try {
      // Additional seats beyond each role's free base aren't set here -
      // per direct product direction, seat management moved into
      // Command Desk itself rather than being asked at signup. Every
      // new Team company starts on the base-only seat counts (0
      // additional for every role); an Owner/Manager can add more
      // later. Meaningless for Solo Operator (a single, hard-capped
      // CPO seat), so companyName/role/office are simply omitted for
      // that plan too - the company row gets named after the person
      // directly, same convention the Owner Console's own onboarding
      // dialog follows, and the account is always role: "cpo".
      await register({
        planType,
        companyName: isSolo ? undefined : companyName,
        role: isSolo ? undefined : role,
        officeCity: isSolo ? undefined : officeCity,
        officeCountry: isSolo ? undefined : officeCountry,
        name,
        email,
        password,
        stripeSetupIntentId: stripeSetupIntentId ?? undefined,
      });
      // register() reloads the page on success - this line only runs if
      // it somehow returns without navigating, as a fallback.
      navigate(isOwnerTesting ? "/owner" : isSolo ? "/cpo" : MANAGEMENT_HOME_ROUTE[role] ?? "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-blue-400" />
          <div className="text-center">
            <div className="text-lg font-bold tracking-wide">VENUEGUARD</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest">Risk Intelligence</div>
          </div>
        </div>

        {isOwnerTesting && (
          <div className="bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs rounded-lg p-3 text-center">
            You're signed in as the Owner - this creates a real company, but you'll stay logged in as yourself and return to the Master Console.
          </div>
        )}

        {planType === null ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400 text-center">What are you signing up for?</p>
            {PLAN_CHOICES.map((choice) => {
              const Icon = choice.icon;
              return (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => setPlanType(choice.value)}
                  className="w-full text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-3 hover:border-blue-500/50 hover:bg-slate-900/70 transition-colors"
                >
                  <Icon className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">{choice.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{choice.description}</div>
                  </div>
                </button>
              );
            })}
            {!isOwnerTesting && (
              <p className="text-xs text-center text-slate-500 pt-2">
                Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <button
              type="button"
              onClick={() => setPlanType(null)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {PLAN_CHOICES.find((c) => c.value === planType)?.label}
            </button>
            {isSolo ? (
              <p className="text-xs text-slate-500">
                Solo Operator is for one individual, not a company - no company name, no Management side, just your own login into Operators Note.
              </p>
            ) : (
              <>
                <div>
                  <Label className="text-slate-300">Company Name</Label>
                  <Input
                    autoFocus
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">Position</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as ManagementRole)}>
                    <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-300">Office Location</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-1.5">Optional - add more offices later from Command Desk.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="City"
                      value={officeCity}
                      onChange={(e) => setOfficeCity(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                    <Input
                      placeholder="Country"
                      value={officeCountry}
                      onChange={(e) => setOfficeCountry(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="border-t border-slate-800 pt-4">
              <Label className="text-slate-300">Your Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Email</Label>
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={agreedToPrice}
                onCheckedChange={(checked) => {
                  const isChecked = checked === true;
                  setAgreedToPrice(isChecked);
                  setPaymentPanelOpen(isChecked);
                  if (!isChecked) {
                    setCardSaved(false);
                    setStripeSetupIntentId(null);
                  }
                }}
                className="mt-0.5 border-slate-700"
              />
              <span className="text-xs text-slate-400">
                I agree to the{" "}
                <span className="text-white font-medium">
                  {monthlyPrice != null ? `$${monthlyPrice}/month` : "..."}
                </span>{" "}
                subscription for {isSolo ? "Solo Operator" : "Management system"}.
                {cardSaved && <span className="text-emerald-400 ml-1">Payment method saved.</span>}
              </span>
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || !canSubmit}>
              {submitting ? "Creating..." : isOwnerTesting ? "Register" : "Create Account"}
            </Button>
            {!isOwnerTesting && (
              <p className="text-xs text-center text-slate-500">
                Already have an account? <Link href="/login" className="text-blue-400 hover:underline">Log in</Link>
              </p>
            )}
          </form>
        )}
      </div>

      {paymentPanelOpen && (
        <PaymentPanel
          monthlyPrice={monthlyPrice}
          planLabel={isSolo ? "Solo Operator" : "Management system"}
          stripeEnabled={stripeEnabled}
          stripePromise={stripePromise}
          onClose={() => setPaymentPanelOpen(false)}
          onSaved={(setupIntentId) => {
            setCardSaved(true);
            setStripeSetupIntentId(setupIntentId ?? null);
            setPaymentPanelOpen(false);
          }}
        />
      )}
    </div>
  );
}
