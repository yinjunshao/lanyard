---
tags: [project, bsa, interview, prep]
status: active
created: 2026-11-11
---
# BSA Interview Prep

Bloomsbury Startup Academy (BSA), run by the UCL Entrepreneurs Society. Interview is in reading week (week of 9 Nov 2026). Interviewer: Shakeel Majeed, BSA Director.

> [!note] How to use this note
> Facts about Lanyard come from this vault ([[Product Overview]], [[Traction and Proof]], [[Go-to-Market]] and others). Anything in **[brackets]** is a number or fact the vault does not have. Fill those in before the interview, because specifics are what make an answer land.

---

## 1. What BSA is and what they want

**What it is**
- UCL's student-led startup launchpad, run by the Entrepreneurs Society. The Students' Union page calls it an in-house pre-accelerator that turns ideas into workable business models and plans.
- Format on the application form: weekly workshops, socials, speaker and fireside chats, and 1-to-1 mentorship. The email stresses building and iterating from week one.
- Very competitive: the application form says 100+ applicants. It also says alumni from the first year have raised millions in funding.
- **Length:** the email and one version of the form say 8 weeks; another version of the form says 10 weeks. Ask Shakeel to confirm the dates and plan your commitment around the real ones.
- The final stage is this interview. The form says the BSA team will challenge your thinking and stress-test the idea. The email says it is informal. Prepare for both: friendly tone, hard questions.

**What they are screening for** (from the email and the form)
- A genuine problem that you can show exists.
- High agency and a bias for action: you ship, you don't wait.
- Willingness to go all in alongside your degree.
- The form describes someone already spending nights and weekends chasing their first 10 to 20 users. That is the bar to meet.

**Logistics**
- [ ] Book the earliest slot at https://cal.com/bsaucle/interview (they want interviews done this week)
- [ ] If anyone applied with you, book a time they can attend; every teammate must be there
- [ ] Confirm Zoom or in-person, and the link or room
- [ ] Phone charged, lanyd.fyi open and logged in, second device ready for the scan demo
- [ ] Look through their Instagram (@bsa.ucle) the night before for alumni, mentors and past startups to mention

---

## 2. Lanyard fact sheet (one page to know cold)

**One line:** Lanyard is a free, no-download QR badge for networking events. Two people scan, take a shared selfie, and each keeps the other's face, name and what they can help with. Event hosts pay.

**How it works for an attendee**
1. Make a card (a name and a selfie is enough, no account needed).
2. Show the QR or the 4-character code.
3. The other person scans, both take a selfie together (both consent), optional private note.
4. Later, the People list shows every connection grouped by event and searchable.

**How it works for a host:** create an event, get an event QR, attendees scan to check in, optional live room of who's there, then an aggregate report and optional feedback survey.

**Status, stated honestly** ([[Traction and Proof]])
- Built and deployed at lanyd.fyi (Cloudflare Workers, D1, R2). v1 and v2 both shipped.
- Demoed live to judges at the UCL Claude Builders Club hackathon. The first real connection made on Lanyard was with one of the judges.
- **No host pilots yet and no paying customers.** Say this yourself, early, then show what you're doing about it.
- Supporter: Ehsan Khavandkar (UCL, BSc Technology and Innovation) is fully behind the project and helping with resources and introductions ([[Network and Introductions]]).
- Ambassadors: UCL, Imperial, Warwick, Bristol; QMUL possible; US universities (Yale, Northwestern) possible. **[How many people, how many active, what each has done so far.]**

**Business model** ([[Business Model]], [[Pricing]])
- B2B2C. Attendees free forever for connecting, the selfie and a basic profile. Hosts pay ([[D001 Hosts pay, attendees free]]).
- Societies: free tier of 1 event a week up to 200 check-ins; then £5 for 1 event, £20 for 5, £25 term pass.
- Universities and institutions: £15 per event, £59 for 5, £149 for 15.
- Companies and organisers: £25 per event, £99 for 5, £249 for 15.
- Careers services and students' unions: from £300 per term (quoted).
- Later: sponsors and employers (likely the largest revenue), and Plus at £2.99 a month for individuals (low priority).
- Principle: price societies near cost, earn higher up ([[D008 Societies near cost, profit higher up]]).

**Competitors** ([[Competitors]])
- Popl and HiHello capture a one-way sales lead. Blinq, Linq and Tappy are generic digital cards.
- Swapcard, Brella and Whova are enterprise event apps, priced beyond 50-300 person events.
- LinkedIn is for people you already know.
- Your line: "Popl and HiHello capture a one-way sales lead; Lanyard saves a two-way relationship with the context of how you met."
- The durable moat is the contextual connection graph (selfie, note, "Come to me for"), not the QR code, which is a commodity.

**Go-to-market** ([[Go-to-Market]])
- UK university events first ([[D006 UK campus beachhead first]]). A host announcing "this is how we connect tonight" brings 50-300 users at once, which solves cold start.
- Plan: 10-20 organiser interviews, then 3-5 free pilots in exchange for a testimonial and permission to publish aggregate numbers, then ask for the first paid event at £15-25.
- Growth loops: "Made with Lanyard" on scanned cards, free first events, referral credits, one ambassador per society.

**Metrics and kill criteria** ([[Metrics and Kill Criteria]])
- Proceed if, at one real event, at least 40% of pairs who scan both save the connection and at least 1 in 3 open a follow-up within 48 hours.
- Rethink if fewer than 2 of 5 pilot hosts would pay for the report (the old £100+ threshold is out of date; reset it to match [[Pricing]]).
- Rethink if people scan once, never return, and treat it as just a QR card.

---

## 3. Weak spots, and how to own them

These are the things a sharp interviewer will find. Raise them before they do.

| Weak spot | What a stress-tester will say | How to frame it |
| --- | --- | --- |
| No pilots, no paying customers | "So nobody has used this at a real event?" | "Correct. I built first. My own notes say I should have validated first ([[D007 Validate before building]]). That's why I applied: BSA is where I turn a built product into evidence." |
| Retention is the biggest risk ([[Risks]]) | "People scan once and never open it again." | Name it as your top risk. Fix: event album, "You met N people" prompt, searchable People list, follow-up nudges. Test it at the first pilot with a 7-day and 30-day return rate. |
| Solo founder | "Can one person build, sell and support live events?" | Honest: sales is a real job and you're deciding about a business or sales co-founder ([[Open Questions]]). Use BSA's community to find one. Mitigate with free-tier caps and running setup yourself at each pilot. |
| Many projects | "Your portfolio has a dozen things. Why will you stay on this?" | Lanyard is the one with a live product, a supporter, ambassadors and a plan. Say what you will pause. **[Decide which projects you're parking for 8 weeks.]** |
| Selfies and privacy | "You're storing photos of people. Is that legal?" | Both-person consent for the shared selfie, either side can delete, aggregate-only host analytics, 18+ only, 48-hour deletion of event presence data ([[Privacy and Data Retention]]). Be honest that the UK GDPR audit has four High items you're fixing before real events ([[UK GDPR Audit 2026-11-01]]), and that ICO registration is on the list. |
| Societies don't pay | "Your best early users have no budget." | Right, that's why societies are a free distribution surface and near-cost. Revenue comes from institutions, careers services and sponsors. |
| Revenue projections | "What's your ARR?" | Don't quote old projections: your own notes say they were invented. Say you'll set targets from pilot data. |

---

## 4. Answers to the seven emailed questions

### 1. Walk us through the problem. How have you validated it?
People meet dozens of others at events and remember almost none. Swapping socials means typing usernames. Nobody remembers what a contact is good at, so the connection goes unused. Shy attendees don't know who to approach. Hosts can't show impact beyond a paper sign-in sheet.

*Validation, with the honest split:*
- Real: the hackathon demo, where the first connection was made with a judge; **[conversations with N students and what they said]**; ambassadors at several universities who chose to back it; professor support.
- Not yet: host pilots and any repeat use. Say that, then say validation is the next 8 weeks.

### 2. Why are YOU the person? What's your edge?
- I ship. Lanyard is live, built end to end by me (front end, Cloudflare backend, host portal, billing requests, privacy controls). My portfolio at arck.industries has a dozen more projects across software and physical products.
- Design is the product. The interaction has to work in three seconds in a noisy room. I have design engineering experience from Xiaomi Automotive and Sevnce Robotics.
- I'm the user. I'm a UCL student at these events.
- Distribution: a supportive professor and ambassadors across several campuses.

### 3. Why does it matter, who does it affect, who first, and what assumptions?
It matters because the value of an event comes from the follow-up, and almost all of it is lost. It affects students and early-career people most, who go to the most events and have the smallest networks.

*First target:* UK university society events and careers fairs, starting at UCL. Free to attendees, easy access to organisers, priced in pounds.

*Assumptions I'm making and will test at pilots:*
1. Attendees will scan a new thing at an event.
2. They'll save the connection (target 40% of scanning pairs).
3. They'll come back (target 1 in 3 open a follow-up within 48 hours).
4. Hosts will pay for the report and the check-in. At £15-25 a "no" teaches me more than ten "sounds interesting".

### 4. Two to three years out?
The default way people connect in person at universities, then conferences and professional events. Revenue from institutions and careers services (termly plans), organisers (per event) and sponsors who want opt-in access to engaged students. Keep this short: they care about the next eight weeks.

### 5. Challenges, and how would you pivot?
- *Retention between events* (biggest): follow-up prompts, event albums, search. Pivot trigger: people scan once and see it as a QR card.
- *Sales is a real job:* run every pilot setup myself, start with 3-5 hosts.
- *Crowded market:* win on price, no download, selfie memory, student fit.
- *Privacy:* selfies are the most sensitive data, so consent and deletion are built in.
- *Pivot paths:* if attendees don't return, make the host product the focus (check-in, live room, feedback report). If societies won't engage, go straight to careers services and students' unions.

### 6. Why BSA, and what exactly do you need?
- A forcing function to turn a built product into evidence: 10-20 organiser conversations and 3-5 pilots in the first weeks.
- Mentors who have sold to institutions or run campus events.
- A co-founder or sales-minded teammate, if I find the right fit.
- Honest pressure-testing of pricing and the model.
- Access: introductions to society committees and event organisers beyond my own network.

### 7. How would you go all in alongside classes, and use the 8 weeks?
Yes. I already build alongside a degree. A concrete plan:
- **Weeks 1-2:** interview 10 organisers; book the first 2 free pilots; fix the High GDPR items so real events are safe.
- **Weeks 3-6:** run 3-5 pilots; log event, attendees, check-ins, connections, selfie rate, 7-day return and a host quote for each.
- **Weeks 7-8:** ask the best-fit host to pay for the next event; decide proceed, change or stop against the thresholds above.
- A weekly rhythm: one measurable goal per week, one thing shipped, one thing learned.
- **[Which projects you're pausing, and how many hours a week you'll commit.]**

---

## 5. Extra stress-test questions (likely follow-ups)

1. **Why would a society organiser use this instead of a Google Form sign-in and an Instagram tag?** Check-in plus the live room plus the aftermath: attendees actually remember each other, and the host gets an aggregate report to show sponsors. Free tier, no install.
2. **Why wouldn't people just use LinkedIn or WeChat QR?** LinkedIn is for people you already know and feels careerist for freshers. WeChat and paper cards work but carry no context. Lanyard's difference is the selfie, the note and what each person can help with. Back it with pilot data comparing exchanges per attendee.
3. **What happens at the event if it breaks?** I run setup myself and test on the day; the free tier is capped at 200 check-ins; the guest card needs no account.
4. **What have you learned from the hackathon?** **[Add one or two concrete lessons from the demo and judge feedback, plus the placement if any.]**
5. **What's your single most important metric?** Return visits within 7 days. A one-off scan means it's a QR card, not a network.
6. **What would make you stop?** The kill criteria: fewer than 2 of 5 pilot hosts would pay, or people scan once and never return.
7. **How do you make money from free attendees?** Hosts pay for events; institutions for termly cohort reports; sponsors later. Attendees are the network, not the customer.
8. **Why UK first and not China?** Direct free access to UCL organisers, pricing in pounds, UK GDPR to comply with. China needs a localised partner because WeChat dominates ([[D006 UK campus beachhead first]]).
9. **Why under-18s excluded?** Safety and privacy: 18+ only ([[D012 18 plus only]]).
10. **If we gave you a mentor, what is the first thing you'd ask?** How to get a careers service or students' union to run a pilot, and what they currently pay for event tools.
11. **Why do you need BSA if you already have a professor?** He opens doors and gives credibility. BSA gives a cohort, structured accountability, mentors who have sold, and the pressure to hit weekly targets.
12. **What would you do in your first week?** Email 10 society presidents with the one-line pitch and a free pilot offer; book 2 conversations; fix the High GDPR items.

---

## 6. Questions to ask them

- What do the most successful BSA teams do differently in weeks 1-3?
- What does a typical week look like, and what's expected from teams each week?
- How do mentors get matched, and can I get one with experience selling to universities?
- Is there a showcase or demo day at the end, and who attends?
- What have alumni done after BSA: further funding, UCL Hatchery, other programmes?
- How many teams are in this cohort, and how do they work with each other?
- Can BSA introduce me to society committees and the students' union to run pilots?

---

## 7. Fill-in numbers and evidence (do these before the interview)

These map to the unknowns in [[Traction and Proof]] and [[Open Questions]].

- [ ] Hackathon name, date and result
- [ ] Accounts, cards and connections made on lanyd.fyi to date
- [ ] Ambassadors: number per university and what each has done
- [ ] Number of students and organisers you've spoken to, plus 2-3 real quotes
- [ ] Any society, department or careers contact already in conversation
- [ ] Any event booked or pencilled for a pilot
- [ ] Which projects you're pausing during BSA, and weekly hours committed
- [ ] Whether anyone else is on the Lanyard team (they must attend)

**Fast ways to get numbers by the interview**
- Run Lanyard at one small event or a friend meetup and measure scans, saved connections, selfies and next-day opens. Even 10 people gives you a real data point.
- Message 5 society presidents with a short pilot offer. Even replies like "interested, send details" count as evidence.
- Ask your ambassadors for one number each: signups, scans or events reached.

---

## 8. Demo script (60-90 seconds)

1. "Imagine you met 30 people last night. How many names do you remember?"
2. Open lanyd.fyi on your phone. Show your card (no account needed).
3. Have Shakeel scan it; take the shared selfie together; add a note.
4. Show the People list: his face, name, "come to me for", where you met.
5. Show the host side: event QR, check-in, aggregate report.
6. Close: "Free for attendees, hosts pay. I'm here to run the first pilots."

Practice it twice on a real phone. If the video call makes scanning awkward, have a screen-share fallback and the 4-character code ready.

---

## 9. Day-of checklist

- [ ] Answer each question in about a minute, then stop and let them dig in
- [ ] Open with who you are in one sentence, then the problem, not the technology
- [ ] Say what's not done (pilots, revenue) before they ask
- [ ] Use numbers wherever you have them; say "I'll find out" rather than guessing
- [ ] Mention the professor and the ambassadors as proof that others back it
- [ ] Ask two questions from section 6
- [ ] Send a thank-you the same day with one concrete next step (for example the pilot plan)

## 10. 30-second and 2-minute pitches

**30 seconds**
"I'm Yinjun, a UCL Technology and Innovation student. Lanyard is a free QR badge for networking events: two people scan, take a shared selfie, and each keeps the other's face, name and what they can help with, so you remember who you met. It's live, I demoed it at a UCL hackathon, and my professor and ambassadors at several universities are behind it. What I don't have yet is pilots, and that's what I want to use BSA for."

**2 minutes** (add to the above)
Problem in two sentences, how it works in two, why hosts pay, the three assumptions you'll test, and the eight-week plan from question 7.

---

Related: [[Go-to-Market]] · [[Metrics and Kill Criteria]] · [[Risks]] · [[Network and Introductions]] · [[Demo Video and Pitch Deck]] · [[Decision Log]]

Sources: [BSA application form](https://tally.so/r/2jj84e) · [UCL Students' Union, Entrepreneurs Society](https://studentsunionucl.org/clubs-societies/entrepreneurs-society) · [lanyd.fyi](https://lanyd.fyi) · [arck.industries](https://www.arck.industries)
