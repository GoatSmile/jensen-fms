# Google Calendar setup — service visits

**For:** whoever sets up Jensen's Google side (the owner of the calendar's
Google account), plus Finn for one step. **Date:** 30 September 2026.
**Time:** about 30 minutes, no cost.

When a customer asks for a visit, the system will put it in a Google calendar
called **Servicebesøg**. Finn and Dennis see it and move visits there as the day
demands. To make that possible, the system needs its own key to that one
calendar. This guide creates the calendar and the key.

The system gets in through a **service account**: a robot user that the calendar
is shared with, like sharing it with a colleague. We do not use a Google login
screen (OAuth), because Google makes an unpublished login expire every 7 days.

| Part | What | Who | Time |
|---|---|---|---|
| A | Create the calendar *Servicebesøg* and share it with the team | Calendar owner | 5 min |
| B | Create the service account and its key in Google Cloud | Calendar owner | 15 min |
| C | Share the calendar with the service account | Calendar owner | 2 min |
| D | Put the key in Vercel and on the developer's machine | Nazar | 5 min |
| E | Send the developer two non-secret values | Calendar owner | 1 min |

## Before you start: whose Google account?

Decided with Dennis on 24 September: the calendar lives in a Google account on
the **service mailbox** (probably `service@jensenproduction.dk`), not in Finn's
personal account. If Finn leaves, the calendar and its history stay with Jensen.

- Use that account for **every step below**, except Finn's own step in Part A.
- If the account does not exist yet, create a free one on that address at
  `accounts.google.com/signup` → *Use my current email address instead*. No Gmail
  is needed, and the mail stays at one.com.
- **Jensen keeps the password and the recovery phone** (Dennis), not Finn and
  not the developer.
- If you decide to use Finn's own account after all, the steps are the same;
  only the owner differs. Tell the developer which one you chose.

## Part A — Create the calendar and share it with the team

1. Sign in to `calendar.google.com` as the calendar's account.
2. Check the time zone first: the gear icon → *Settings* (*Indstillinger*) →
   *Time zone* (*Tidszone*) must be **Copenhagen (GMT+01:00)**.
3. On the left, next to *Other calendars* (*Andre kalendere*), press **+** →
   *Create new calendar* (*Opret ny kalender*).
4. Name: **Servicebesøg**. Time zone: Copenhagen. Press *Create calendar*.
5. On the left, point at *Servicebesøg* → the three dots → *Settings and
   sharing* (*Indstillinger og deling*).
6. Under *Share with specific people or groups* (*Del med bestemte personer
   eller grupper*) → *Add people and groups* (*Tilføj personer og grupper*):
    - **Finn's own Google address** → *Make changes to events* (*Foretag
      ændringer i begivenheder*).
    - **Dennis** → the same, or *See all event details* if he only watches.
7. **Never tick *Make available to public*** (*Gør tilgængelig for
   offentligheden*). The events carry customer names and addresses.
8. **Finn:** open the invitation email and press the link, so *Servicebesøg*
   appears on his phone and laptop next to his own calendar.

## Part B — The service account and its key

1. Go to `console.cloud.google.com`, signed in as the calendar's account.
   Accept the terms if Google asks. **No billing account or card is needed**
   for this.
2. Top left, *Select a project* → **New project**. Name: `jensen-fms`. Create,
   then make sure it is the selected project at the top.
3. Menu → *APIs & Services* → *Library*. Search **Google Calendar API** → open
   it → **Enable**.
4. Menu → *IAM & Admin* → *Service accounts* → **+ Create service account**.
    - Name: `jensen-fms-calendar`. Press *Create and continue*.
    - Skip *Grant this service account access* (no role is needed) → *Done*.
5. In the list, copy the service account's **email address**. It looks like
   `jensen-fms-calendar@jensen-fms-123456.iam.gserviceaccount.com`. You need
   it in Parts C and E.
6. Open the service account → tab **Keys** → *Add key* → *Create new key* →
   **JSON** → *Create*. A file downloads, for example `jensen-fms-123456-ab12cd.json`.

> **That file is a password.** Anyone holding it can edit the calendar. Do not
> email it, put it in chat, or save it in a shared folder. Part D moves it to
> the only two places it belongs; then delete the download.

Google Cloud may show these menus in Danish (*API'er og tjenester*, *IAM og
administration*, *Tjenestekonti*). The screens come in the same order.

## Part C — Share the calendar with the service account

1. Back in `calendar.google.com` → *Servicebesøg* → *Settings and sharing*.
2. *Share with specific people or groups* → *Add people and groups* → paste the
   **service account email** from Part B, step 5.
3. Permission: **Make changes to events** (*Foretag ændringer i begivenheder*)
   → *Send*. Google may warn that the address is outside your organisation.
   That is expected; confirm.
4. Still on the settings page, scroll to *Integrate calendar* (*Integrer
   kalender*) and copy the **Calendar ID** (*Kalender-id*). It looks like
   `a1b2c3…@group.calendar.google.com`.

## Part D — Put the key where the system reads it (Nazar)

The key goes in exactly two places, under the name
**`GOOGLE_SERVICE_ACCOUNT_KEY`**, and never in the database or the app's
settings pages. That is the house rule for every secret.

**Vercel (production):**

1. `vercel.com` → project **jensen-fms** → *Settings* → *Environment Variables*
   → *Add New*.
2. Key: `GOOGLE_SERVICE_ACCOUNT_KEY`. Value: open the downloaded `.json` file in
   a text editor, select everything, copy, paste. Environment: **Production**
   (and *Preview* if you use it). *Save*.
3. The next deploy picks it up. The developer triggers one when the calendar
   code ships.

**The developer's machine (`.env.local`):** in Terminal, in the project folder,
run this with the real file name. It adds the key as one line without printing
it:

```bash
python3 -c "import json,sys; print(\"GOOGLE_SERVICE_ACCOUNT_KEY='\" + json.dumps(json.load(open(sys.argv[1]))) + \"'\")" ~/Downloads/jensen-fms-123456-ab12cd.json >> .env.local
```

Then **delete the downloaded file** (and empty the bin). If you want a backup,
keep it in the password manager only.

## Part E — Send the developer two values

These are **not secret**; chat or mail is fine:

1. The **service account email** (Part B, step 5).
2. The **Calendar ID** (Part C, step 4).

And say whose account owns the calendar (service mailbox or Finn's own).

## What happens next

The developer builds the connection, and the admin settings get a *Calendar*
section: provider **Google**, the calendar ID, and a light showing whether the
key is present (never the key itself). Then:

- A visit a caller asks for arrives as a **suggestion** on the call, like the
  offer and the repair ticket today. A person presses apply, and the visit
  appears in *Servicebesøg*.
- Finn moves or edits visits **directly in Google**. That needs no approval.
- Events hold only the customer, the bike and a short problem, plus a link to
  the ticket. Phone numbers and contact names stay in the system.

## If something goes wrong

| Problem | Fix |
|---|---|
| *Create new key* is greyed out or refused ("key creation is disabled") | The account belongs to a Google Workspace organisation that blocks keys. Use the free service-mailbox account, or ask the Workspace admin to lift the policy *iam.disableServiceAccountKeyCreation* for this project. |
| Sharing only offers *See only free/busy* | Workspace restricts sharing outside the organisation. The Workspace admin allows it for calendars, or use the free account. |
| *Servicebesøg* does not appear for Finn | He has not accepted the share. Resend it from Part A, step 6, and have him open the link while signed in to his own Google account. |
| The key was emailed or shared by mistake | Google Cloud → the service account → *Keys* → delete that key, create a new one, and redo Part D. The old key stops working at once. |
