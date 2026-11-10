-- F10 fixture: host data in the shape production has before F10 (migrations
-- 0001-0017), for test/hosts-accounts.mjs and the local dry run of
-- scripts/reset-hosts.mjs. Made-up people and organisations only.

-- Two attendees, and two people who used their attendee account to host.
INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified) VALUES
  ('fxatt00001', 1700000000000, 0, 'ann@example.com', 1),
  ('fxatt00002', 1700000000000, 0, NULL, 0),
  ('fxhost0001', 1700000000000, 0, 'hal@company.example.com', 1),
  ('fxhost0002', 1700000000000, 0, 'sue@example.ac.uk', 1);
INSERT INTO profiles (user_id, name, updated_at) VALUES
  ('fxatt00001', 'Ann Attendee', 1700000000000),
  ('fxatt00002', 'Ben Attendee', 1700000000000),
  ('fxhost0001', 'Hal Host', 1700000000000);
INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES
  ('fxsess0000000000000000000000000001', 'fxatt00001', 1700000000000, 4100000000000),
  ('fxsess0000000000000000000000000002', 'fxhost0001', 1700000000000, 4100000000000);

INSERT INTO host_profiles (user_id, email, full_name, use_case, event_frequency, created_at) VALUES
  ('fxhost0001', 'hal@company.example.com', 'Hal Host', 'Meetups', 'About once a month', 1700000000000),
  ('fxhost0002', 'sue@example.ac.uk', 'Sue Society', 'Socials', 'Weekly or more', 1700000000000);
INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES
  ('fxcons0001', 'fxhost0001', 'host_terms:2026-10-26', 1, 1700000000000),
  ('fxcons0002', 'fxhost0002', 'host_terms:2026-10-26', 1, 1700000000000),
  ('fxcons0003', 'fxatt00001', 'terms:2026-10-26', 1, 1700000000000);
INSERT INTO consent_log (id, user_id, scope, action, at) VALUES
  ('fxclog0001', 'fxhost0001', 'host_terms:2026-10-26', 'granted', 1700000000000);

-- A company with events, and a society application.
INSERT INTO orgs (id, name, plan, org_type, verification_status, billing_email, leader_name, leader_email, created_at) VALUES
  ('fxorg00001', 'Example Events Ltd', 'starter', 'company', 'approved', 'hal@company.example.com', 'Hal Host', 'hal@company.example.com', 1700000000000),
  ('fxorg00002', 'Example Chess Society', 'starter', 'society', 'pending', 'sue@example.ac.uk', 'Sue Society', 'sue@example.ac.uk', 1700000000000);
INSERT INTO org_members (org_id, user_id, role) VALUES
  ('fxorg00001', 'fxhost0001', 'owner'),
  ('fxorg00002', 'fxhost0002', 'owner');
INSERT INTO org_invites (code, org_id, role, created_by, created_at, expires_at) VALUES
  ('FXINVITE', 'fxorg00001', 'staff', 'fxhost0001', 1700000000000, 4100000000000);
INSERT INTO org_transfers (id, org_id, from_user_id, to_user_id, to_email, status, created_at) VALUES
  ('fxtran0001', 'fxorg00001', 'fxhost0001', 'fxhost0002', 'sue@example.ac.uk', 'declined', 1700000000000);
INSERT INTO host_tickets (id, org_id, user_id, kind, message, status, created_at) VALUES
  ('fxtick0001', 'fxorg00002', 'fxhost0002', 'other', 'Please check our application', 'open', 1700000000000);
INSERT INTO org_integrations (org_id, webhook_url, created_at) VALUES
  ('fxorg00001', 'https://hooks.example.org/x', 1700000000000);
INSERT INTO credits (id, org_id, events_granted, events_used, reason, granted_by, created_at) VALUES
  ('fxcred0001', 'fxorg00001', 3, 2, 'starter', 'self-serve', 1700000000000);
INSERT INTO promo_redemptions (code, org_id, created_at) VALUES
  ('FXPROMO', 'fxorg00001', 1700000000000);

-- Two events, with check-ins, a sponsor, feedback and mail already sent.
INSERT INTO events (id, org_id, code, name, starts_at, created_at) VALUES
  ('fxevt00001', 'fxorg00001', 'FXEV1', 'Example Meetup', 1700000000000, 1700000000000),
  ('fxevt00002', 'fxorg00001', 'FXEV2', 'Example Meetup 2', 1700100000000, 1700100000000);
INSERT INTO checkins (event_id, user_id, created_at) VALUES
  ('fxevt00001', 'fxatt00001', 1700000000000),
  ('fxevt00001', 'fxatt00002', 1700000000000),
  ('fxevt00002', 'fxatt00001', 1700100000000);
INSERT INTO sponsors (id, event_id, name, logo_key) VALUES
  ('fxspon0001', 'fxevt00001', 'Example Sponsor', 'event/fxlogo0001.webp');
INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES
  ('fxcons0004', 'fxatt00001', 'sponsor:fxspon0001', 1, 1700000000000);
INSERT INTO feedback_responses (id, event_id, answers, day) VALUES
  ('fxfb000001', 'fxevt00001', '{"closed":{},"text":{}}', 1700000000000);
INSERT INTO feedback_done (event_id, user_id) VALUES ('fxevt00001', 'fxatt00001');
INSERT INTO event_mail_log (event_id, user_id, kind, sent_at) VALUES
  ('fxevt00001', 'fxatt00001', 'feedback', 1700000000000),
  ('fxevt00001', 'fxhost0001', 'host_summary', 1700000000000);

-- The two attendees met at the first event; Ann has a card made for it.
INSERT INTO connections (id, user_a, user_b, event_id, created_at) VALUES
  ('fxconn0001', 'fxatt00001', 'fxatt00002', 'fxevt00001', 1700000000000);
INSERT INTO cards (id, user_id, code, name, event_id, is_default, created_at) VALUES
  ('fxcard0001', 'fxatt00001', 'FXC1', 'Ann Attendee', 'fxevt00001', 1, 1700000000000);

-- Invoice records: must survive everything.
INSERT INTO billing_requests (id, org_id, user_id, sku, quantity, amount_pence, contact_email, status, created_at) VALUES
  ('fxbill0001', 'fxorg00001', 'fxhost0001', 'company_5', 1, 4950, 'hal@company.example.com', 'paid', 1700000000000),
  ('fxbill0002', 'fxorg00001', 'fxhost0001', 'company_1', 2, 2500, 'accounts@company.example.com', 'open', 1700100000000);
