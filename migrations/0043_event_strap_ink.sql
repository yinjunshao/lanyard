-- F65: the colour of the words on an event's strap when the host chooses one (white or dark); additive, nullable. NULL, for every event
-- that exists, means Automatic: white or black, whichever reads better on the strap. The Worker keeps one of two exact colours and
-- only if it reads at 4.5:1 on the strap the event will have (worker/hosts.js); the theme is free text, so it needs no change here.
ALTER TABLE events ADD COLUMN strap_ink TEXT;
