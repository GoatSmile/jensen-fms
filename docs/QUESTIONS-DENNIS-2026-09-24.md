# Questions for Dennis — the phone line, Finn, and your bikes

**24 September 2026.** Everything I need answered to start the next three
pieces of work: recording Finn's repair calls, moving Finn's repair work into
the system, and loading the bikes already out with your customers. Each
question says in a line why it matters. *"Don't know"* is a perfectly good
answer — it tells me who to ask next.

---

## A · The phone line

What we want: a customer rings your number, presses 2 for service, reaches
Finn, and the call is recorded and turned into a repair ticket by itself. The
recording side is built and has been tested on a real call. What is missing is
connecting **your** number to it.

**You're with Relatel, for the switchboard and Finn's mobile.** That helps: Relatel
has an API and webhooks, so the system can talk to it. What I read in
Relatel's own documentation, so we start from the same facts:

- Relatel **can record calls** — on the main number, and on a mobile with the
  *Mobilfeatures* add-on. But the recordings stay **inside Relatel's app**:
  only the employee (and, for incoming calls, an administrator) can listen,
  and outgoing recordings must be saved by hand within an hour. Their public
  API can download **voicemails**, but I found no way to fetch **call
  recordings**. So Relatel's recording would let Finn listen back — it would
  not turn calls into written-out repair tickets.
- **Webhooks** (the system hearing about each call as it happens) and
  main-number recording come only with the **Contact Center** and
  **Unlimited** subscriptions. Relatel's webhook guide (August 2026) lists
  exactly what they send: a call **started** and **ended** on a *main number*,
  an incoming SMS, chats and contact changes. **Nothing for recordings, and
  nothing for calls made straight from a mobile number.** So webhooks could
  give the system a call log for the main number — who, when, how long — but
  not the conversation. Relatel says more events will follow.

That is why the plan is still: option 2 goes to a number of ours, and Finn's
call-backs go out through a *Call customer* button in the system. Relatel can
answer the questions marked **(Relatel)** below in one call — it may be
quickest if you ring them, or let me.

**A1. Which Relatel subscription do you have — Professional, Contact Center or
Unlimited?** *(Relatel)* *Decides whether webhooks and recording are there at
all. The name is on the invoice or in app.relatel.dk.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A2. What is the exact number customers ring?** *It is a landline-type
number, which is good news: if you ever want the whole number moved to Twilio,
the phone service the system uses, that is possible (Twilio can take over
Danish landline numbers, not mobile ones; about four weeks of paperwork). The
plan does not need it — option 2 alone is enough — so this is a door kept
open, not a step.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A3. Who set up the menu ("press 2 for service"), and can you change it
yourself?** *The plan is to point option 2 at a new number of ours instead of
straight at Finn. That is the whole change — your number and menu stay as they
are.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A4. Can option 2 be sent to an outside number?** *(Relatel)* *Relatel's
switchboard can pass calls to colleagues, ring groups and phone contacts, so
this is very likely a yes — but it is the one thing the whole plan rests on.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A5. When a call is passed on, does the caller's own number come with it — or
does it arrive showing your company number?** *(Relatel)* *The system recognises customers
by their phone number. If every call shows your own number, it recognises
nobody.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A6. What should happen when Finn doesn't answer, or outside working hours?**
*Voicemail is ready: the message is written out and lands in the system the
same way. Or should the call go to someone else first?*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A7. Should Finn's own calls *out* to customers be recorded too?** *The plan
is a* Call customer *button on each repair job: his phone rings, then the
customer's, and the call is recorded and filed on that job. Calls he dials
straight from his contacts would not be captured — unless Relatel says yes to
the next question.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A7b. Can Relatel's call recordings be fetched through their API — and is a
recording event planned for webhooks?** *(Relatel)* *Webhooks don't carry
recordings today (their own guide says so). If the API can hand them over,
every call Finn makes could be captured however he dials, and the system would
collect them from Relatel.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A8. Whose name and card should the phone account be in — yours or mine?**
*It will carry your number and your customers' calls, so I'd rather it were
yours. It is about 15 kr. a month for the number plus per-minute call charges — for a repair line alone, under the 230–350 kr. a month I estimated for all your calls.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

## B · Finn and the repair work

Most of what Finn needs is already in the system — a list of his jobs, a
screen per job for what he found and what he did (he can speak it instead of
typing), photos, parts used, and whether the customer's agreement covers it.
It has never been used for a real repair. These answers decide what I adjust
before he tries it.

**B1. Where does Finn do repairs — at the customer's site, in the workshop, or
both? Roughly how much of each?**

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B2. What will he use — his phone, an iPad, a computer? Whose device is it?**
*The system works on all three; I want to test it on the one he'll actually
hold.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B3. Is there mobile signal where he works?** *Hospital basements and bike
cellars often have none. The system needs a connection to save his work, and
making it work offline is a real project — so only if he needs it.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B4. Does he carry spare parts in his van?** *If yes, parts he uses on site
don't come off the workshop shelf, and the stock count needs to know the van
exists.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B5. How does a repair job reach him today — phone, email, a note, you?** *So
the new way covers every door the work comes in through.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B6. How does he record what he did and how long it took, today?** *Time is
what gets billed when the customer has no agreement.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B7. Does the customer get anything in writing after a repair?** *The system
can hold a short customer-facing summary, in Danish and English. Does anyone
want one?*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B8. Is Finn happy to have his calls recorded, and has he been told in
writing?** *Callers hear a notice on every call. Telling Finn is the employer's
job — yours — not the system's.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**B9. Which customer should we start with?** *I'd like one customer end to end
for a week or two — their bikes, their agreement, Finn's repairs on them —
before everyone else.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

## C · Your bikes and service agreements

A repair has to be attached to a bike, and the system doesn't know the bikes
already out with your customers yet. The spreadsheet and guide I sent explain
the list; these are the questions behind it.

**C1. Roughly how many bikes are out with customers, and with how many
customers?**

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C2. Where is that information today?** *Excel, delivery notes, e-conomic
invoices, paper, your head? If it exists anywhere, send it as it is — I'll
sort it rather than have you retype it.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C3. Do you know the frame numbers, or do customers know their bikes by their
own numbers ("bike 14")?**

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C4. How many service agreements are running, and where are the papers?**
*Scanned PDFs are fine, one per agreement.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C5. Does any agreement cover only *some* of a customer's bikes — say 20 of
their 35?** *Today the system assumes an agreement covers every bike that
customer (or that site) has. I need to know about exceptions before anything
is loaded, not after.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C6. What do the agreements typically NOT cover?** *Tyres, vandalism,
batteries, punctures? That line decides which repairs get invoiced.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C7. A few customers appear twice in the system under the same name** —
*Rigshospitalet, Herlev SSP, several Nybolig offices and a handful of others.
Are they really two customers each (two departments, two addresses), or
duplicates I should merge? I'll bring the list.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

---

**What happens next.** With A answered I order the Danish number — Twilio
checks the company paperwork first, usually a few days — and connect option 2. With B answered I adjust Finn's screens and we
try it on one customer. With C the bikes go in — one customer first, shown to
you, then the rest.
