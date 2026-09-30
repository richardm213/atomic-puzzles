-- Coin requests have been retired. Keep historical request rows and notifications,
-- but remove the callable database entry point so coins can only be given.

drop function if exists public.request_coins(text, text, integer, text);

notify pgrst, 'reload schema';
