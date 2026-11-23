-- Allow each user to delete their own inbox rows (clear read notifications).
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = recipient_id);
