-- Allow the authenticated notifications Netlify function to permanently remove
-- notifications after it verifies and scopes the request to the recipient.
grant delete on table public.notifications to service_role;

notify pgrst, 'reload schema';
