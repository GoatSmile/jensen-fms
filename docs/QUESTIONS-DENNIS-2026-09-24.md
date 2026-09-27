# Questions for Dennis — the phone line, Finn, and your service agreements

**24 September 2026 — updated 27 September** (the phone line, section A; the
service agreements, section C). Everything I need answered to start the next
three pieces of work: recording Finn's repair calls, moving Finn's repair work
into the system, and your service agreements with their yearly invoices. Each
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

## C · Your service agreements

Your agreements pay about half of what it costs to run the company, and today
the renewals are invoiced by hand from the spreadsheet. The system should do it
for you: a month before each bike's anniversary, a ready invoice for the next 12
months, which you check and send to e-conomic.

On 15 September you explained that an agreement covers **bikes, not a whole
customer**: each bike starts on its delivery day, renews every year on that day
unless it is cancelled, and has its own price. The system does not work that way
yet — it assumes one agreement covers everything a customer owns — so I am
changing it **before** your bikes and agreements are loaded. These answers fill
in the details. *(The questions about loading the bikes themselves are in the
separate letter "Your bikes into the system".)*

**C1. Are the twelve month sheets in your big spreadsheet (Januar … December)
the complete list of bikes you invoice a renewal for?** *They list 867 bikes.
If the Trello list John is cleaning is newer, I should load from that instead.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C2. What does a yearly price of 0 kr mean?** *311 bikes in the month sheets
show 0 — most of them bought 2012–2017. Free years included in the sale? An
agreement that has ended? Paid some other way? The system will not invoice a
0-kr bike until I know.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C3. What does each contract type cost per bike per year — K1, K3, K5, K10?**
*Most bikes show 1 704 kr (142 kr × 12), and 2 184 kr with GPS (+480). Others
show 2 284, 2 160, 1 200 and a few more. Is the price set by the contract type,
or agreed customer by customer?*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C4. Which contract type is each customer on?** *If it is easier, mark it on
the customer list I bring on Tuesday.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C5. Can a customer leave before the contract period ends — say, after two
years of a K5?** *And when the period is over, does it renew one year at a time,
or for a whole new period?*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C6. When a customer stops covering one bike in the middle of a year — or it
is stolen or scrapped — do you give money back for the rest of the year, or
does it simply not renew next time?** *This decides whether the system writes a
credit note or just stops that bike's renewal.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C7. When a bike is replaced or moved to another department, does its
agreement move with it — same price, same renewal date?** *The spreadsheet lists
32 frames twice, which is often a replacement or a move.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C8. Should a customer with several departments get one renewal invoice per
department (per EAN number), or one invoice for the whole customer?** *Public
customers usually need the department's EAN on the invoice. The month sheets
have an EAN on most rows.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C9. How many days do customers have to pay a renewal invoice — 30?** *You
mentioned 30 days on 15 September; the system uses 14 for everything today.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C10. Please send the text of your service agreement, and scans of the ones
that are signed.** *You mentioned sending the text — I have not found it.
Scanned PDFs are fine, one per agreement.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C11. What do the agreements NOT cover?** *Tyres, vandalism, batteries,
punctures? That line decides which repairs get invoiced.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

**C12. A few customers appear twice in the system under the same name** —
*Rigshospitalet, Herlev SSP, several Nybolig offices and a handful of others.
Are they really two customers each (two departments, two addresses), or
duplicates I should merge? I'll bring the list.*

<div style="height:30pt;border-bottom:0.8pt solid #dcdcd5"></div>

---

**What happens next.** With A done on Tuesday we know within the hour whether
Relatel works. If it does, Finn's calls start arriving in the system; if not, I
order a Danish number of ours (a few days of paperwork) and connect option 2.
With B answered I adjust Finn's screens and we try it on one customer. With C —
and the bike letter — your bikes and their agreements go in, one customer first,
shown to you, then the rest; after that the renewal invoices draft themselves a
month ahead, for you to check and send.
