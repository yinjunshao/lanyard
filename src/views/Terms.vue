<script setup>
// Terms of Service. Bracketed items are for the operator to fill in before launch.
// Bump TERMS_VERSION in worker/legal.js when this changes materially.
const OPERATOR = "ARCK Softworks";
const ADDRESS = "WC1E 6BT";
const CONTACT = "yinjun@arck.industries";
const UPDATED = "26 October 2026";
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col legal">
    <header class="profile-top"><router-link to="/" class="wordmark">lanyard<b>.</b></router-link></header>

    <h1>Terms of Service</h1>
    <p class="muted">Last updated {{ UPDATED }}. Part A applies to everyone. Part B also applies if you use Lanyard as a host (<a href="#hosts">jump to Part B</a>).</p>

    <h2>Part A. Everyone</h2>

    <h3>1. Who we are</h3>
    <p>
      Lanyard is a service for sharing a digital card at events and keeping the connections you make.
      It is run by {{ OPERATOR }} ("Lanyard", "we", "us"), {{ ADDRESS }}. You can reach us at
      <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>. These terms are a contract between you and us. Please also
      read our <router-link to="/privacy">Privacy Policy</router-link>, which explains how we handle personal data.
    </p>

    <h3>2. Who can use Lanyard</h3>
    <p>
      You must be 18 or over. You confirm this when you create a profile. If we learn that someone is under 18 we will
      close the account and delete its data. You must be able to form a binding contract, and not be barred from using
      the service by law.
    </p>

    <h3>3. Your account</h3>
    <p>
      You can look around and connect as a guest, but creating a profile creates your account. Keep your passkey,
      recovery key and sign-in codes private. You are responsible for what happens under your account, so tell us
      promptly if you think someone else has access. We may limit how many cards or features an account has, as set out
      on our pricing and plan pages.
    </p>

    <h3>4. What you share, and what we do with it</h3>
    <ul>
      <li>You own the content you add (your profile, photos, links, notes). You give us a licence to store it and show it to other people as you have chosen, so the service can work. The licence ends when you delete the content or your account, except for copies already held by other people as part of a connection you made, and backups that are deleted on our normal schedule.</li>
      <li>Each card shows only the details and links you choose for it. A private profile stays private, except for the limited identity you agree to show in an event directory.</li>
      <li>Only share things you have the right to share. Do not upload content that infringes someone else's rights.</li>
    </ul>

    <h3>5. Connections, notes and shared selfies</h3>
    <ul>
      <li>A connection belongs to both people. Either person can remove it at any time, and removing it deletes the connection, its notes thread and the shared selfie for both of you.</li>
      <li>A shared selfie is optional. Only take or upload one if every person in it has agreed, and tick the confirmation when you do. If someone in the photo asks you to delete it, delete it.</li>
      <li>Your private notes about a connection are only visible to you.</li>
      <li>A note left in a card's QR code is delivered once, to the next person who connects through it.</li>
    </ul>

    <h3>6. Acceptable use</h3>
    <p>You agree not to:</p>
    <ul>
      <li>harass, threaten, stalk, discriminate against or impersonate anyone, or create a profile pretending to be someone else;</li>
      <li>upload or share unlawful, hateful, sexually explicit or deceptive content, or photos of people who have not agreed;</li>
      <li>collect other people's details in bulk, scrape the service, or use it to send spam or unsolicited marketing;</li>
      <li>guess, brute-force or share sign-in codes, backup codes or recovery keys, or try to get around rate limits or other security measures;</li>
      <li>probe, attack or overload the service, or reverse engineer it except as the law allows;</li>
      <li>use Lanyard in a way that breaks the law or these terms.</li>
    </ul>

    <h3>7. Reporting and moderation</h3>
    <p>
      If you see something that breaks these terms, tell us at <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a> with a link to the card or
      connection. We may remove content, limit features, or suspend or close accounts that break these terms or put
      others at risk. Where we can, we will tell you why. You can ask us to review a decision by replying to our message.
    </p>

    <h3>8. Events</h3>
    <p>
      Events are run by hosts, not by us. Joining an event means you check in with a card, and you may be asked
      optional questions and optional choices (for example, appearing in the event's attendee directory or sharing
      details with a named sponsor). Those choices are separate and optional, are never pre-ticked, and you can change
      them. Hosts only receive anonymous totals about their event; they are not told who connected with whom.
    </p>

    <h3>9. Free and paid features</h3>
    <p>
      Lanyard is free to use for attendees. We may offer a paid personal plan (Lanyard Plus). If we do, the price,
      billing period and what is included will be shown to you before you pay, and these terms will be updated for it.
      Hosts' fees are covered in Part B.
    </p>

    <h3>10. Availability and changes to the service</h3>
    <p>
      We try to keep Lanyard running, but we do not promise it will always be available or error-free. We may change,
      suspend or remove features. Do not rely on Lanyard as the only copy of anything important; you can download your
      data in Settings.
    </p>

    <h3>11. Our responsibility to you</h3>
    <p>
      Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury
      caused by negligence, for fraud, or for your statutory consumer rights. Subject to that, we are not liable for
      loss that was not a foreseeable result of our breach, for loss of profits, business or opportunity, or for the
      actions of other users or hosts. Lanyard is provided "as is". Our total liability to you for anything arising from
      the service is limited to the greater of £100 and the amount you paid us in the 12 months before the claim.
    </p>

    <h3>12. Ending things</h3>
    <p>
      You can stop using Lanyard and delete your account at any time in Settings. We can suspend or close your account
      if you seriously or repeatedly break these terms, if we are required to by law, or if we stop providing the
      service (in which case we will give you reasonable notice where we can). Sections that by their nature should
      continue (such as liability and governing law) will continue after the account ends.
    </p>

    <h3>13. Changes to these terms</h3>
    <p>
      We may update these terms. If a change is material we will ask you to agree again the next time you use the app,
      and we will show the date above. If you do not agree to new terms you can delete your account.
    </p>

    <h3>14. Law and disputes</h3>
    <p>
      These terms are governed by the law of England and Wales, and the courts of England and Wales can hear disputes,
      without affecting any right you have as a consumer to use the courts of the part of the UK where you live.
    </p>

    <h2 id="hosts">Part B. Hosts</h2>
    <p class="muted">Applies if you create a host account or run an event on Lanyard, in addition to Part A.</p>

    <h3>15. Host accounts and organisations</h3>
    <ul>
      <li>A host account is a separate account from any personal card. You must be 18 or over and authorised to act for the society, department, company or other organisation you set up. You confirm you are when you create the account.</li>
      <li>The person who creates the organisation is its owner. Owners can invite colleagues with an invite code. Everyone you invite works under your organisation, and you are responsible for the people you invite and for what they do in it. Remove people who should no longer have access.</li>
      <li>Keep your organisation details accurate, including its type and billing email.</li>
    </ul>

    <h3>16. Events and credits</h3>
    <ul>
      <li>One credit covers one event. New organisations receive some free starter credits, which expire after the period shown in the portal.</li>
      <li>Each credit is for an event with up to 300 check-ins. If you go over, we will not block people at the door but we may ask you to buy additional credits.</li>
      <li>Credits cannot be exchanged for cash, are not transferable between organisations, and expire as shown when you buy them.</li>
      <li>You are responsible for your events: the venue, safety, accessibility, and compliance with the law and the rules of any host venue or institution (for example a students' union or university).</li>
    </ul>

    <h3>17. Fees and payment</h3>
    <ul>
      <li>Prices are shown in the portal and on our host pages. Until online payments are available, you buy credits by requesting an invoice. Credits are added once the invoice is paid. Payment terms are stated on the invoice.</li>
      <li>Prices may exclude VAT where it applies. We may change prices for future purchases; changes do not affect credits you have already paid for.</li>
      <li>Unused credits are non-refundable except where the law requires, or where we have not provided the service you paid for.</li>
    </ul>

    <h3>18. Attendee information and data protection</h3>
    <p>
      For attendees' accounts, profiles, connections and check-ins, Lanyard is the controller (see the Privacy Policy). Hosts
      receive only anonymous, aggregated information about their events: totals, and counts of answers that meet a
      minimum group size. Hosts do not receive attendee names, contact details or who connected with whom. You agree that
      you will not:
    </p>
    <ul>
      <li>try to identify individual attendees from our reports, or combine them with other data to do so;</li>
      <li>pressure, require or reward attendees for sharing more than they chose to share;</li>
      <li>use anything you learn through Lanyard to discriminate against, profile or exclude people;</li>
      <li>ask attendees for sensitive personal data (such as health, religion, ethnicity, sexuality or politics) through custom check-in questions.</li>
    </ul>
    <p>
      If you collect personal data about attendees by other means (for example tickets, registration or photos), that is
      your own responsibility under data protection law, separate from Lanyard. Sponsor choices are opt-in per sponsor;
      you must only name sponsors that have actually agreed to take part and you must not promise attendees things you
      cannot deliver.
    </p>

    <h3>19. Event content</h3>
    <p>
      Event names, venues, perks, questions and themes that you enter must be accurate, lawful and not misleading. You
      give us permission to display them to attendees. Do not use another organisation's name or branding without permission.
    </p>

    <h3>20. Suspension and ending</h3>
    <p>
      We may suspend or close a host account for breaking these terms, for non-payment, or if an event puts attendees at
      risk. You can stop using the host portal at any time. If an organisation has no remaining members, we may delete
      its events and data, keeping only the financial records we are required to keep. Part A sections 11 to 14 apply
      to hosts too; where the host is a business, our liability limit in section 11 applies to the fees paid by that
      organisation in the previous 12 months, and nothing excludes liability we cannot exclude.
    </p>

    <p class="muted" style="margin-top:32px">
      Questions about these terms? <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>
      · <router-link to="/privacy">Privacy Policy</router-link> · <router-link to="/">Home</router-link>
    </p>
  </main>
</template>

<style>
.legal h1 { margin-top: 12px; }
.legal h2 { margin-top: 36px; padding-top: 18px; border-top: var(--border-ink, 1.5px solid #1b1a17); }
.legal h3 { margin-top: 22px; font-size: 17px; }
.legal p, .legal ul { margin-top: 8px; line-height: 1.55; }
.legal ul { padding-left: 20px; }
.legal li { margin-top: 6px; }
.legal a { text-decoration: underline; }
.legal table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
.legal th, .legal td { text-align: left; vertical-align: top; padding: 8px 10px 8px 0; border-bottom: var(--border, 1px solid #d8d2c5); }
.legal th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--graphite, #6b675f); }
</style>
