<script setup>
import { homePath } from "../lib/store";
// Privacy Policy (UK GDPR). Bracketed items are for the operator to fill in before launch.
const OPERATOR = "ARCK Softworks";
const ADDRESS = "WC1E 6BT";
import { HELP_EMAIL, LEGAL_EMAIL } from "../lib/contact";
const CONTACT = LEGAL_EMAIL;
const HELP = HELP_EMAIL;
const UPDATED = "10 November 2026";
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col legal">
    <header class="profile-top"><router-link :to="homePath()" class="wordmark">lanyard<b>.</b></router-link></header>

    <h1>Privacy Policy</h1>
    <p class="muted">Last updated {{ UPDATED }}. This covers people who use Lanyard to carry a card (users) and organisations that run events on it (hosts).</p>

    <h2>1. Who is responsible</h2>
    <p>
      {{ OPERATOR }} ("Lanyard", "we") of {{ ADDRESS }} is the controller of the personal data described here under the
      UK GDPR and the Data Protection Act 2018. Contact us at <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a> for anything about your data.
    </p>

    <h2>2. What we collect</h2>
    <table>
      <thead><tr><th>Who</th><th>Data</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td>Users</td><td>Name, whether you are a student or working, company, role, university, course, year, headline, about text, tags, links, profile photo, and whether you show your age band</td><td>To make your card and profile and show them as you choose</td></tr>
        <tr><td>Users</td><td>Connections you make, which card was scanned, how you met (QR code, typed code or link) and when, optional note, private notes, messages, and shared selfies</td><td>To keep your connections and let both people see them</td></tr>
        <tr><td>Users</td><td>Event check-ins, answers to optional questions, and your optional directory and sponsor choices</td><td>To join events and respect your choices</td></tr>
        <tr><td>Users</td><td>If you choose "Be easy to find" at an event: a photo of your face, a short line about you, and what kind of person you would like to meet</td><td>To let other people at that event who chose the same spot you in the room. Optional and off unless you turn it on</td></tr>
        <tr><td>Users</td><td>If AI features are on and you tap one: what you type, and details about the people involved that you can already see (never email addresses, links or photos), sent to our AI provider; a count of how often you used it; and the reply, kept for a few days</td><td>To draft messages, find people you already know and suggest people to meet, and to keep the cost and the limits under control. See section 8c</td></tr>
        <tr><td>Hosts</td><td>If AI features are on: the written answers to your event feedback, without names, sent to our AI provider to write a summary, and a count of how often you used it</td><td>To summarise anonymous feedback for you. See section 8c</td></tr>
        <tr><td>Users</td><td>Your private follow-up reminders and the tags you put on your connections</td><td>So you can remember who to follow up with; only you see them</td></tr>
        <tr><td>Users</td><td>Promo codes you redeem, when, and your place in the queue for that code</td><td>To give out limited offers fairly, one per person (this is why redeeming needs a confirmed email)</td></tr>
        <tr><td>Users</td><td>Event feedback answers (ratings, choices and optional written answers), stored without your name or account, plus a separate record that you have answered</td><td>To give organisers anonymous feedback, and to ask you only once</td></tr>
        <tr><td>Everyone</td><td>Session cookie or device token, passkey public key, hashed recovery key, sign-in codes (short-lived), and, if you add them, your verified email address (we email you a note when someone signs in, and one reminder per event you checked in to asking for feedback, which you can switch off) and your authenticator-app secret (stored encrypted), and records of your terms and consent choices</td><td>To keep you signed in, secure your account, and prove what you agreed to</td></tr>
        <tr><td>Users</td><td>Reports you make about another person (the reason you write) and people you block</td><td>To keep people safe and keep blocks working; only our admin can read reports</td></tr>
        <tr><td>Everyone</td><td>IP address and basic request data, kept briefly in rate-limit counters and security logs</td><td>To stop abuse and guessing of codes</td></tr>
        <tr><td>Hosts</td><td>Your full name and email, your answers to the sign-up questions, organisation name and type, for societies and institutions the leader's name, the society or institution link and university, billing email, ownership transfers and support tickets, team members and roles, events you create, credits and invoice requests</td><td>To run the host portal and bill you</td></tr>
        <tr><td>Hosts</td><td>Integration settings: a webhook address and its signing secret, and a one-way hash of your API key; sign-up counts you send us</td><td>To connect Lanyard to your other tools</td></tr>
      </tbody>
    </table>
    <p>
      We do not ask for sensitive ("special category") data. Please do not put it in your profile, notes or event questions.
      We do not buy data about you and we do not use advertising or tracking cookies.
    </p>

    <h2>3. Why we may use it (lawful bases)</h2>
    <ul>
      <li><b>Contract</b>: running your account, card, connections and events, which you asked us to provide.</li>
      <li><b>Consent</b>: news and offers by email (a separate tick box, off by default), shared selfies, appearing in an event directory, being easy to find at an event (your face photo, line and wish), and sharing details with a named sponsor. You can withdraw these at any time and it is as easy to withdraw as to give.</li>
      <li><b>Legitimate interests</b>: keeping the service secure, preventing abuse, counting usage in aggregate, and letting people you have connected with find you using AI search from what you already show them (you can switch this off at any time in Settings). We weigh this against your rights and you can object.</li>
      <li><b>Legal obligation</b>: keeping financial records, and responding to lawful requests.</li>
    </ul>

    <h2>4. Who sees your data</h2>
    <ul>
      <li><b>Other users</b> see what is on the card you share, and what you choose to show in a connection.</li>
      <li><b>Hosts</b> only receive anonymous, aggregated figures about their events. They are not told who attended by name or who connected with whom. Feedback reaches them only as totals once at least 3 people have answered, and written answers only once at least 5 have, without names. Sponsors only receive details you opted in to share with that named sponsor.</li>
      <li><b>Our service providers</b> process data for us under contract. Today that is Cloudflare, which hosts the app, database and image storage. Resend sends our emails (sign-in codes, account and host application messages, and news if you opt in), so your email address and the message go to them. If we add payments or other providers, we will name them here first.</li>
      <li><b>AI providers</b>, only when AI features are on: Anthropic provides the AI model and Cloudflare AI Gateway carries the request. See section 8c.</li>
      <li><b>Hosts' own tools</b>: if a host connects a webhook, we send it the same anonymous event totals they see in their report, never personal data.</li>
      <li>We may disclose data where the law requires it, or to protect people from serious harm.</li>
      <li>We never sell your data.</li>
    </ul>

    <h2>5. Transfers outside the UK</h2>
    <p>
      Our providers may process data outside the UK. Where they do, we rely on the UK's approved safeguards, such as the
      UK International Data Transfer Addendum or adequacy regulations, and contract terms that protect your data.
    </p>

    <h2>6. How long we keep it</h2>
    <table>
      <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
      <tbody>
        <tr><td>Profile, card, connections, notes</td><td>Until you delete them or your account</td></tr>
        <tr><td>Shared selfies</td><td>7 days if the other person has not accepted it, then deleted. Once accepted, until either person removes it or the connection, and no more than 12 months after it was taken</td></tr>
        <tr><td>"Be easy to find" photo, line and wish</td><td>Until you turn it off, when they are deleted at once, and no later than 48 hours after the event ends</td></tr>
        <tr><td>An AI reply (a draft, a search result or a summary)</td><td>7 days, so asking again costs nothing, then deleted. We do not keep what was sent to the model</td></tr>
        <tr><td>Counts of AI use (how many times, tokens and cost; no text)</td><td>13 months, or until you delete your account</td></tr>
        <tr><td>Sign-in codes</td><td>5 to 10 minutes, single use</td></tr>
        <tr><td>Your email address</td><td>Until you delete your account. News emails stop as soon as you untick the box or use the unsubscribe link</td></tr>
        <tr><td>Rate-limit counters, expired sessions</td><td>Days; removed automatically</td></tr>
        <tr><td>Unclaimed guest sessions with no profile</td><td>Removed automatically after a period of inactivity</td></tr>
        <tr><td>Consent history (what you agreed to or withdrew, and when; not your profile)</td><td>6 years, kept after your account is deleted, as proof of what you agreed to</td></tr>
        <tr><td>Reports you make about other people, with your reason</td><td>12 months</td></tr>
        <tr><td>Blocks</td><td>While both accounts exist</td></tr>
        <tr><td>Privacy requests and complaints</td><td>3 years after we close them</td></tr>
        <tr><td>Admin access log (who looked up what)</td><td>12 months</td></tr>
        <tr><td>Accounts nobody has used</td><td>24 months. If you have a verified email we warn you 30 days before we delete it; signing in once keeps it</td></tr>
        <tr><td>Database backups</td><td>Short-term point-in-time backups by our database provider, up to 30 days, after which deleted data is gone from them too</td></tr>
        <tr><td>Host invoices and billing records</td><td>6 years, as the law requires</td></tr>
        <tr><td>Follow-up reminders and your tags</td><td>Until you remove them, the connection, or your account</td></tr>
        <tr><td>Written feedback answers</td><td>12 months, then removed automatically; anonymous ratings and choices are kept so organisers can compare events</td></tr>
        <tr><td>The record that you gave feedback</td><td>Until you delete your account</td></tr>
      </tbody>
    </table>

    <h2>7. Your rights</h2>
    <p>Under UK data protection law you can:</p>
    <ul>
      <li>get a copy of your data. In <router-link to="/app/settings/privacy">Settings</router-link> you can download it;</li>
      <li>correct it. Edit your profile at any time;</li>
      <li>delete it. Settings lets you delete your account, which removes your profile, photos, connections and selfies;</li>
      <li>withdraw consent, object to our use of your data based on legitimate interests, and ask us to limit its use;</li>
      <li>take your data to another service, using the download;</li>
      <li>not be subject to decisions made only by automated means with legal or similar effects. We do not make any.</li>
    </ul>
    <p>
      Hosts have the same rights over their own account data (name, email, sign-up answers, billing requests and tickets).
      Use Settings, or <router-link to="/privacy-request">send us a request or complaint</router-link>, which needs no account. We email an
      acknowledgement straight away, log every request, and answer within one month (30 days for a complaint, and sooner where we can).
      You can also write to <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>. If you are unhappy with how we handled your data, you can
      complain to the Information Commissioner's Office (<a href="https://ico.org.uk" rel="noopener">ico.org.uk</a>, 0303 123 1113).
    </p>

    <h2>8. Event feedback</h2>
    <p>
      After an event you checked in to, you may be asked for optional feedback. Your answers are stored without your
      name or account, so the organiser can't tell who wrote what and we can't link them back to you. Because of that we
      can't show you or delete an individual answer later. Please don't put personal details in written answers.
      Organisers must not ask about health, religion, ethnicity, sexuality or politics.
    </p>

    <h2>8a. Shared selfies and other people's data</h2>
    <p>
      A shared selfie can show someone else. The person who takes it confirms everyone in it agrees, and the other person then
      has to accept it in the app before it is kept. Until they do it is only a request to them (they can see it to decide), and
      we delete it after 7 days. Either person can remove it at any time, which deletes it for both, and the connection stays.
      If you appear in a photo you did not agree to, tell us and we will remove it.
    </p>

    <h2>8b. Be easy to find at an event</h2>
    <p>
      At an event that is on, you can choose to show a photo of your face, a short line and your first name and last initial to
      other people checked in to the same event who have made the same choice, so you can spot each other in the room. It is off
      until you turn it on, for that event only. They do not see your card, links or contact details, and organisers only see how
      many people used it. We suggest people to meet from what each of you already shows on your cards. Nobody outside the event, and
      nobody once the event has ended, can see it. Turning it off deletes your photo and line at once; otherwise they are deleted
      48 hours after the event ends. You must be 18 or over to use Lanyard, so this is only ever shown between adults.
    </p>

    <h2>8c. AI features</h2>
    <p>
      Some features use an AI model: drafting a follow-up message, finding someone you already know, suggesting people to meet at an
      event, and summarising anonymous feedback for hosts. Nothing runs unless you tap it, a person reads every result and nothing is
      sent for you, and each feature has a version without AI. We can switch them all off at any time, and they have daily and monthly limits.
    </p>
    <ul>
      <li><b>What is sent</b>: only what you could already see, plus what you type. Never email addresses, links, photos or other people's private notes. Text written by other people is treated as content to read, never as instructions.</li>
      <li><b>Being found</b>: people you have connected with can ask an AI feature to find someone they know. Your card can come up using only what you already show them. This is on unless you switch it off in <router-link to="/app/settings/privacy">Settings</router-link>, and it takes effect at once. It rests on legitimate interests; you can object.</li>
      <li><b>Who processes it</b>: Anthropic (the model) and Cloudflare (AI Gateway). Both may process data outside the UK, under the safeguards in section 5. We use them on terms that do not let them train their models on this data, and we turn off logging of what is sent. We do not keep it ourselves.</li>
      <li><b>What we keep</b>: the reply for 7 days, and counts of use for 13 months (section 6). Both are in your data download and are deleted with your account.</li>
      <li><b>Decisions</b>: results are suggestions for a person to read. They have no legal or similar effect.</li>
    </ul>

    <h2>9. Children</h2>
    <p>
      Lanyard is for people aged 18 and over. We ask you to confirm this when you create a profile. If we find out
      someone under 18 has an account we will delete it.
    </p>

    <h2>10. Security</h2>
    <p>
      Connections use HTTPS. Session tokens and API keys are stored only as one-way hashes, requests from other
      websites are refused, and shared selfies are only served to the two people in them. Sign-in codes are short, single use and rate-limited; recovery keys are stored only as a one-way
      hash. Hosts see only aggregates, with small groups hidden. No system is perfectly secure. If a breach puts your
      rights at risk we will tell you and the ICO as the law requires.
    </p>

    <h2>11. Cookies and similar storage</h2>
    <p>
      We use a single strictly necessary cookie to keep you signed in, and the browser's local storage for a few settings
      that make the app work on your device (for example, remembering a dismissed hint). The app also keeps a copy of its
      own files and of your card details on your device so your card opens without signal; signing out or deleting your
      account clears your details from it. These do not need consent because they are strictly necessary for the
      service you asked for. We do not use analytics, advertising or tracking cookies. If we ever
      add any, we will ask first with a clear choice, and update this section before we do.
    </p>

    <h2>12. Changes</h2>
    <p>
      We will update this policy as the service changes. The date above shows the latest version. If a change affects how
      we use your data in a way you would not expect, we will tell you in the app before it takes effect.
    </p>

    <p class="muted" style="margin-top:32px">
      <router-link to="/terms">Terms of Service</router-link> · <router-link to="/terms#hosts">Host terms</router-link> · <router-link to="/">Home</router-link>
    </p>
  </main>
</template>
