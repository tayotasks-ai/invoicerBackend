# Business direction: invoicing for Nigerian SMEs

*Last updated 2026-08-19*

## The uncomfortable competitive reality first

Paystack and Flutterwave — the two payment gateways this product already integrates with — both give away invoicing for free, monetizing only on the transaction fee. Zoho Invoice and Wave are also free. So "create a nice invoice and collect payment" is not, by itself, a sellable product to a Nigerian SME in 2026. If that's all this does, the pitch to a business owner is "pay me for something Paystack already gives you." That has to change before this is worth selling.

## The wedge: compliance, not cosmetics

Nigeria's FIRS e-invoicing mandate went live for large taxpayers in November 2025, and **mandatory compliance for medium and small VAT-registered businesses started January 2026** — which, as of today, is already in force. Businesses are required to integrate with the national e-invoicing platform using the Peppol BIS Billing 3.0 UBL standard. That's a real, current, legally-mandated pain point that:

- Free tools from Paystack/Flutterwave aren't built around (their invoicing is a payment-collection feature bolted onto a payment gateway, not a tax-compliance product).
- Most SME owners have never heard of and have no way to implement themselves — "integrate with a national e-invoicing platform using Peppol UBL" is not something a boutique agency or a five-person retail shop can do in-house.
- Justifies a subscription price on its own, separate from payment processing.

The direction: **don't compete as "another invoice generator." Compete as "the invoicing tool that keeps your SME compliant with FIRS e-invoicing without you having to understand what any of that means."** Invoicing, PDF generation, and Paystack collection become the free/entry-level hook that gets a business using the product daily; compliance, multi-staff, and reporting are what they pay for.

## Who this is for (ICP)

Nigerian VAT-registered SMEs currently invoicing by WhatsApp, Word, or Excel: service businesses, agencies, consultants, small retailers, and contractors who (a) now have a legal obligation they don't fully understand, (b) want to look professional to clients, and (c) want to get paid faster without chasing bank transfers. Not targeting enterprises — the large-taxpayer segment is already served by dedicated tax-tech vendors and internal finance teams.

## Positioning

"Invoices your clients trust, payments that land in your account, and compliance you don't have to think about." Three legs: professional branded invoicing (logo/signature, already built), collection (Paystack subaccounts, already built), and FIRS e-invoicing compliance (the differentiator, not yet built).

## Pricing direction

Priced in naira, anchored against the ₦1,500–₦6,500/month range competitors sit in:

- **Free** — 2 invoices/month, one bank account, Paystack collection, the 6 free (no-logo) invoice templates. This is the acquisition funnel, not a revenue line — deliberately tight so a business hits the cap within its first real month and feels the upgrade nudge.
- **Growth (₦4,500/month)** — 20 invoices/month, the 6 premium logo-branded templates, staff accounts, email delivery and reminders, FIRS e-invoicing submission included. This is the tier the compliance deadline should push most paying customers into.
- **Business (₦15,000+/month)** — unlimited invoices, multiple business entities under one login (the `parent_id` staff hierarchy already in the data model supports this), accountant/bookkeeper export, API access, priority support.

Compliance is the reason to upgrade off Free, not a Free-tier feature — it's the thing competitors don't have and SMEs are now legally on the hook for. Implemented in `src/config/plans.js`; enforced server-side in `InvoiceService.createInvoice` (monthly cap) and `EntityService.editEntity` (premium template gating).

## Roadmap, in priority order

1. **Close the loop between "create an invoice" and "customer receives it."** Today the API can create an invoice but there's no way for a customer to actually see or pay one — no email delivery, no public (unauthenticated) invoice view. This is table stakes before anything else matters. *(Built in this session — see below.)*
2. **Recurring invoices and automated payment reminders.** SMEs with retainer clients or subscriptions currently have to recreate the same invoice every month by hand.
3. **FIRS e-invoicing integration** — the strategic differentiator. Needs its own scoping pass once we can pull the actual FIRS/Peppol integration specs; flagged here as the next major initiative, not attempted blind in this session.
4. **A minimal reporting view**: outstanding/overdue receivables, revenue by month, VAT collected — the numbers an SME owner or their accountant actually needs at tax time.
5. **WhatsApp invoice delivery.** Repeatedly called out as a differentiator by competitors in this market — Nigerian SMEs communicate with clients on WhatsApp far more than email.
6. **Quotes/estimates** that convert into invoices, since many service businesses need to send a quote before they send a bill.

## What shipped in this session toward #1

- `POST /invoice` now emails the customer their invoice (PDF attached) the moment it's created, if they have an email on file.
- A new public, unauthenticated `GET /public/invoice/:code` endpoint so the payment link that's already embedded in every generated PDF actually resolves to something a customer can view before paying.
- The Paystack webhook now emails a payment receipt to the customer once a payment is confirmed.

## Templates, subscriptions & partial payments (this session)

- **12 invoice templates**, HTML/CSS rendered to PDF via headless Chromium (`puppeteer-core`) rather than the original PDFKit approach — see `src/utils/templates/`. 6 free (no logo), 6 premium (logo placement), each a genuinely distinct layout (bordered, minimal, split, receipt, banded, sidebar), not just a recolor. A business picks one via `PATCH /entity { invoiceTemplate }`, previews any unlocked one with their own logo via `GET /entity/templates/:templateId/preview`.
- **Operational note**: HTML-to-PDF rendering needs a real Chromium binary on the production host — `PUPPETEER_EXECUTABLE_PATH` in `sample`/`.env` documents this. Not needed for local dev if a system Chrome/Chromium is already installed.
- **Subscription tiers** in `src/config/plans.js` (Free/Growth/Business, see Pricing direction above). True Paystack recurring billing needs a Subscription Plan created from the Paystack dashboard first, which isn't accessible from this environment — `POST /entity/subscribe` stands in with a one-time transaction tagged `metadata.purpose = 'subscription'`, upgraded to real recurring billing is a drop-in swap once dashboard access exists.
- **Partial invoice payments**: `Invoice.amountPaid` accumulates across multiple Paystack transactions; `POST /invoice/:code/initiate-payment` accepts an optional `amount` to pay less than the full balance; status flips to `partially-paid` vs `paid` based on the running total, not a single transaction. `GET /invoice/:code/transactions` returns the full payment history + balance due.

See the "Implementation" section of project memory / chat for the technical detail.
