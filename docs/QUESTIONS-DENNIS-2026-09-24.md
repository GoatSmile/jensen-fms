# Questions for Dennis — the phone line, Finn, and your bikes

**24 September 2026 — updated 27 September** (the phone line, section A).
Everything I need answered to start the next three
pieces of work: recording Finn's repair calls, moving Finn's repair work into
the system, and loading the bikes already out with your customers. Each
question says in a line why it matters. *"Don't know"* is a perfectly good
answer — it tells me who to ask next.

---

## A · The phone line

What we want: a customer rings your number, presses 2 for service, reaches
Finn, and the call is recorded and turned into a repair ticket by itself. The
recording-to-ticket side is built and has been tested on a real call. What is
missing is getting **your** calls to it.

**New since the first version of this page — good news from your own Relatel
account.** I looked through it on 26 September (and changed nothing):

- Your switchboard plan is **Omstilling Professional**, and it **includes
  Relatel's API** — the door through which another system can fetch calls from
  Relatel.
- **Finn's mobile (42 47 15 51) already has *Mobilfeatures*** — the add-on that
  **records his calls on the network, incoming and outgoing, automatically**,
  once it is switched on. That covers the calls he makes from his own phone, not
  only the ones that come in through option 2.
- **Option 2** on 70 21 05 46 **already rings Finn**.
- Relatel's API lists every call with a link to its recording, and hands over
  voicemails as sound files. The one thing their documentation does not say is
  whether the recordings of **mobile** calls show up there. That is a test, not
  a guess.

**So the plan changes: we test Relatel first, on Finn's own line, instead of
buying a new phone number.** It costs nothing extra — everything it needs is
already on your Relatel bill. If the test passes, nothing changes for Finn or
your customers: he keeps his number and his phone, and every call he takes or
makes can become a written note in the system. If it fails, we go back to the
first plan: option 2 goes to a number of ours, which rings Finn and records the
call.

One thing your plan does not have: *webhooks*, Relatel telling the system about
a call the moment it ends (those come with Contact Center and Unlimited). So the
system fetches Finn's new calls every few minutes instead. For repair notes,
that is fine.

**What we test on Tuesday, together with Finn** (about 15 minutes): one call
through option 2, one call straight to his mobile, one call he makes himself,
and one voicemail. Then we check that the system can fetch all four, with the
sound — and whether the caller's number comes through, because the system
recognises customers by their phone number.

**A1. Can Finn switch on recording and make a key for the system on Tuesday —
with us beside him?** *In Relatel's app, logged in as himself: turn on "Optag
indgående opkald" and "Optag udgående opkald" (30 days is enough), and create a
personal access token — the key that lets the system fetch his calls. It has to
be Finn's own: Relatel lets only the number's own user hear its recordings, not
an administrator. Five minutes; it is the whole test.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A2. May we add one sentence to the welcome greeting on your main number —
"Samtaler kan blive optaget"?** *Relatel records without telling the caller,
and Danish rules require telling people. The greeting covers every call through
the menu; on calls straight to his mobile, Finn says it himself.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A3. What should happen when Finn doesn't answer, or outside working hours?**
*Relatel already takes a voicemail, and the system can fetch those too and
write them out. Or should the call go to someone else first?*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**A4. What is your second number, 70 21 05 45, used for?** *Customers ring
70 21 05 46, where the menu is. If service calls also arrive on the second
number, the plan should cover it too.*

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
writing?** *Callers will be told through the greeting (A2). Telling Finn is the
employer's job — yours — not the system's.*

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

**What happens next.** With A done on Tuesday we know within the hour whether
Relatel works. If it does, Finn's calls start arriving in the system; if not, I
order a Danish number of ours (a few days of paperwork) and connect option 2.
With B answered I adjust Finn's screens and we try it on one customer. With C
the bikes go in — one customer first, shown to you, then the rest.
