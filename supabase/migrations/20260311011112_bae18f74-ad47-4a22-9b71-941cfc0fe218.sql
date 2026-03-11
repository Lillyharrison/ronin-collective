-- Create a trigger function that fires send-push-notification
-- for all thread participants (except the sender) when a new message arrives.
CREATE OR REPLACE FUNCTION public.notify_push_on_new_message()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  thread_participants uuid[];
  recipient_ids       uuid[];
  sender_name         text;
  preview             text;
BEGIN
  -- Only fire for real (non-AI-generated) messages
  IF NEW.is_ai_generated THEN
    RETURN NEW;
  END IF;

  -- Get participant list for this thread
  SELECT participant_ids INTO thread_participants
  FROM public.chat_threads
  WHERE id = NEW.thread_id;

  -- Recipients = all participants except the sender
  SELECT ARRAY(
    SELECT UNNEST(thread_participants)
    EXCEPT
    SELECT NEW.sender_id
  ) INTO recipient_ids;

  IF array_length(recipient_ids, 1) IS NULL OR array_length(recipient_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Get sender display name
  SELECT COALESCE(full_name, 'Someone') INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  -- Build a short preview (truncate long messages)
  preview := CASE
    WHEN NEW.content_text IS NOT NULL THEN
      CASE WHEN length(NEW.content_text) > 60 THEN left(NEW.content_text, 60) || '...' ELSE NEW.content_text END
    WHEN NEW.media_type = 'image' THEN 'Photo'
    WHEN NEW.media_type = 'audio' THEN 'Voice message'
    ELSE 'Attachment'
  END;

  -- Call the send-push-notification edge function asynchronously
  PERFORM net.http_post(
    url     := 'https://apaoexixichuqeuhinss.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object(
      'recipientUserIds', to_jsonb(recipient_ids),
      'title',            sender_name,
      'body',             preview,
      'url',              '/messages'
    )
  );

  RETURN NEW;
END;
$$;

-- Attach trigger to messages table
DROP TRIGGER IF EXISTS on_new_message_push ON public.messages;
CREATE TRIGGER on_new_message_push
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_new_message();