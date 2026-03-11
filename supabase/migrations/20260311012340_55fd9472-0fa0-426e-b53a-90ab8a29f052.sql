-- The trigger on messages was missing — create it now
DROP TRIGGER IF EXISTS on_new_message_push ON public.messages;

CREATE TRIGGER on_new_message_push
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_new_message();