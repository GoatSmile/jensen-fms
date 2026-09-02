-- 96 · The copied notification rows had their recipient in the wrong column
--
-- `notification_log.recipient` was the PERSON's address — who the notification
-- was for — while the actual send, under outbound test mode, went to the test
-- inbox instead. Migration 94 copied that value into `to_emails`, which is
-- "who received this", so a rerouted historical send now claims to have
-- reached the person. That is precisely the confusion `intended_to` exists to
-- prevent.
--
-- For the copied test-mode rows: the address we know is the INTENDED one, and
-- the real recipient was never recorded. Say that, rather than guessing.
-- Only rows carrying the "(body not recorded …)" marker are touched, so a real
-- send logged since 94 is untouched.
update outbound_messages
set intended_to = to_emails,
    to_emails = '{}'
where kind = 'notification'
  and test_mode
  and from_email = '(not recorded)'
  and intended_to = '{}'
  and to_emails <> '{}';
