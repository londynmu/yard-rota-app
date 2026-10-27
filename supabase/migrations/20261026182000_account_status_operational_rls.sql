-- #19 Wave B3: gate OPERATIONAL tables with is_approved_active_user().
-- DO NOT apply to production without owner approval.
--
-- Pending / rejected users MUST keep:
--   - own profiles SELECT / UPDATE (safe columns via existing privilege guard)
--   - locations SELECT, agencies SELECT
--   - Waiting-for-approval poll, auth, self-delete RPC
--
-- Privileged roles admin / vmu / transport_manager are whitelisted even if
-- account_status is odd, so live ops are not locked out.

CREATE OR REPLACE FUNCTION public.is_approved_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_active, true)
      AND (
        p.account_status = 'approved'
        OR p.role IN ('admin', 'vmu', 'transport_manager')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_active_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_active_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- scheduled_rota
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS scheduled_rota_select ON public.scheduled_rota;
CREATE POLICY scheduled_rota_select ON public.scheduled_rota
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS scheduled_rota_insert ON public.scheduled_rota;
CREATE POLICY scheduled_rota_insert ON public.scheduled_rota
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS scheduled_rota_update ON public.scheduled_rota;
-- Keep B1 (#22): UPDATE remains admin-only. claim_shift is SECURITY DEFINER.
CREATE POLICY scheduled_rota_update ON public.scheduled_rota
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS scheduled_rota_delete ON public.scheduled_rota;
CREATE POLICY scheduled_rota_delete ON public.scheduled_rota
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

-- ---------------------------------------------------------------------------
-- scheduled_breaks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS scheduled_breaks_select ON public.scheduled_breaks;
CREATE POLICY scheduled_breaks_select ON public.scheduled_breaks
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS scheduled_breaks_insert ON public.scheduled_breaks;
CREATE POLICY scheduled_breaks_insert ON public.scheduled_breaks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

DROP POLICY IF EXISTS scheduled_breaks_update ON public.scheduled_breaks;
CREATE POLICY scheduled_breaks_update ON public.scheduled_breaks
  FOR UPDATE TO authenticated
  USING (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  )
  WITH CHECK (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

DROP POLICY IF EXISTS scheduled_breaks_delete ON public.scheduled_breaks;
CREATE POLICY scheduled_breaks_delete ON public.scheduled_breaks
  FOR DELETE TO authenticated
  USING (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- attendance / attendance_notes
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS attendance_select_authenticated ON public.attendance;
CREATE POLICY attendance_select_authenticated ON public.attendance
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS attendance_insert_admin ON public.attendance;
CREATE POLICY attendance_insert_admin ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_update_admin ON public.attendance;
CREATE POLICY attendance_update_admin ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_delete_admin ON public.attendance;
CREATE POLICY attendance_delete_admin ON public.attendance
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_notes_select_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_select_admin ON public.attendance_notes
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_notes_insert_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_insert_admin ON public.attendance_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_notes_update_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_update_admin ON public.attendance_notes
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS attendance_notes_delete_admin ON public.attendance_notes;
CREATE POLICY attendance_notes_delete_admin ON public.attendance_notes
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

-- ---------------------------------------------------------------------------
-- availability, break slots, shift claims, slot configs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS availability_select ON public.availability;
CREATE POLICY availability_select ON public.availability
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS availability_insert ON public.availability;
CREATE POLICY availability_insert ON public.availability
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

DROP POLICY IF EXISTS availability_update ON public.availability;
CREATE POLICY availability_update ON public.availability
  FOR UPDATE TO authenticated
  USING (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  )
  WITH CHECK (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

DROP POLICY IF EXISTS availability_delete ON public.availability;
CREATE POLICY availability_delete ON public.availability
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS break_slot_capacities_select ON public.break_slot_capacities;
CREATE POLICY break_slot_capacities_select ON public.break_slot_capacities
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS break_slot_capacities_insert ON public.break_slot_capacities;
CREATE POLICY break_slot_capacities_insert ON public.break_slot_capacities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS break_slot_capacities_update ON public.break_slot_capacities;
CREATE POLICY break_slot_capacities_update ON public.break_slot_capacities
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_manager())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS break_slot_capacities_delete ON public.break_slot_capacities;
CREATE POLICY break_slot_capacities_delete ON public.break_slot_capacities
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS custom_break_slots_select ON public.custom_break_slots;
CREATE POLICY custom_break_slots_select ON public.custom_break_slots
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS custom_break_slots_insert ON public.custom_break_slots;
CREATE POLICY custom_break_slots_insert ON public.custom_break_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS custom_break_slots_update ON public.custom_break_slots;
CREATE POLICY custom_break_slots_update ON public.custom_break_slots
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_manager())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS custom_break_slots_delete ON public.custom_break_slots;
CREATE POLICY custom_break_slots_delete ON public.custom_break_slots
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_manager());

DROP POLICY IF EXISTS slot_configurations_select ON public.slot_configurations;
CREATE POLICY slot_configurations_select ON public.slot_configurations
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS slot_configurations_insert ON public.slot_configurations;
CREATE POLICY slot_configurations_insert ON public.slot_configurations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS slot_configurations_update ON public.slot_configurations;
CREATE POLICY slot_configurations_update ON public.slot_configurations
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS slot_configurations_delete ON public.slot_configurations;
CREATE POLICY slot_configurations_delete ON public.slot_configurations
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shift_claims_select ON public.shift_claims;
CREATE POLICY shift_claims_select ON public.shift_claims
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS shift_claims_insert ON public.shift_claims;
CREATE POLICY shift_claims_insert ON public.shift_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND (user_id = (SELECT auth.uid()) OR public.is_admin())
  );

DROP POLICY IF EXISTS shift_claims_update ON public.shift_claims;
CREATE POLICY shift_claims_update ON public.shift_claims
  FOR UPDATE TO authenticated
  USING (
    public.is_approved_active_user()
    AND (user_id = (SELECT auth.uid()) OR public.is_admin())
  )
  WITH CHECK (
    public.is_approved_active_user()
    AND (user_id = (SELECT auth.uid()) OR public.is_admin())
  );

DROP POLICY IF EXISTS shift_claims_delete ON public.shift_claims;
CREATE POLICY shift_claims_delete ON public.shift_claims
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

-- ---------------------------------------------------------------------------
-- settings (reads used by approved app screens; writes stay admin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS settings_select ON public.settings;
CREATE POLICY settings_select ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS settings_insert ON public.settings;
CREATE POLICY settings_insert ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS settings_update ON public.settings;
CREATE POLICY settings_update ON public.settings
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS settings_delete ON public.settings;
CREATE POLICY settings_delete ON public.settings
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

-- ---------------------------------------------------------------------------
-- pre-check / VMU
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tugs_select_all ON public.tugs;
CREATE POLICY tugs_select_all ON public.tugs
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS tugs_insert_admin_vmu ON public.tugs;
CREATE POLICY tugs_insert_admin_vmu ON public.tugs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_vmu());

DROP POLICY IF EXISTS tugs_update_admin_vmu ON public.tugs;
CREATE POLICY tugs_update_admin_vmu ON public.tugs
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_vmu())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_or_vmu());

DROP POLICY IF EXISTS tugs_delete_admin_vmu ON public.tugs;
CREATE POLICY tugs_delete_admin_vmu ON public.tugs
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_or_vmu());

DROP POLICY IF EXISTS tug_tablets_select_all ON public.tug_tablets;
CREATE POLICY tug_tablets_select_all ON public.tug_tablets
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS tug_tablets_insert_admin ON public.tug_tablets;
CREATE POLICY tug_tablets_insert_admin ON public.tug_tablets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS tug_tablets_update_admin ON public.tug_tablets;
CREATE POLICY tug_tablets_update_admin ON public.tug_tablets
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS tug_tablets_delete_admin ON public.tug_tablets;
CREATE POLICY tug_tablets_delete_admin ON public.tug_tablets
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS check_items_select_all ON public.precheck_check_items;
CREATE POLICY check_items_select_all ON public.precheck_check_items
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS check_items_insert ON public.precheck_check_items;
CREATE POLICY check_items_insert ON public.precheck_check_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

DROP POLICY IF EXISTS check_items_update ON public.precheck_check_items;
CREATE POLICY check_items_update ON public.precheck_check_items
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_manager_or_vmu())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

DROP POLICY IF EXISTS check_items_delete ON public.precheck_check_items;
CREATE POLICY check_items_delete ON public.precheck_check_items
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

DROP POLICY IF EXISTS precheck_submissions_select ON public.precheck_submissions;
DROP POLICY IF EXISTS precheck_submissions_select_all_authenticated ON public.precheck_submissions;
CREATE POLICY precheck_submissions_select ON public.precheck_submissions
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS precheck_submissions_insert ON public.precheck_submissions;
CREATE POLICY precheck_submissions_insert ON public.precheck_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS precheck_items_select ON public.precheck_items;
CREATE POLICY precheck_items_select ON public.precheck_items
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND EXISTS (
      SELECT 1 FROM public.precheck_submissions ps
      WHERE ps.id = precheck_items.submission_id
    )
  );

DROP POLICY IF EXISTS precheck_items_insert ON public.precheck_items;
CREATE POLICY precheck_items_insert ON public.precheck_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND EXISTS (
      SELECT 1 FROM public.precheck_submissions
      WHERE precheck_submissions.id = precheck_items.submission_id
        AND precheck_submissions.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS precheck_damages_select ON public.precheck_damages;
CREATE POLICY precheck_damages_select ON public.precheck_damages
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS precheck_damages_insert ON public.precheck_damages;
CREATE POLICY precheck_damages_insert ON public.precheck_damages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND EXISTS (
      SELECT 1 FROM public.precheck_submissions
      WHERE precheck_submissions.id = precheck_damages.submission_id
        AND precheck_submissions.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS precheck_damages_update ON public.precheck_damages;
CREATE POLICY precheck_damages_update ON public.precheck_damages
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_manager_or_vmu())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

DROP POLICY IF EXISTS precheck_damage_confirmations_select ON public.precheck_damage_confirmations;
CREATE POLICY precheck_damage_confirmations_select ON public.precheck_damage_confirmations
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS precheck_damage_confirmations_insert ON public.precheck_damage_confirmations;
CREATE POLICY precheck_damage_confirmations_insert ON public.precheck_damage_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS precheck_damage_fixed_confirmations_select ON public.precheck_damage_fixed_confirmations;
CREATE POLICY precheck_damage_fixed_confirmations_select ON public.precheck_damage_fixed_confirmations
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS defect_reports_select ON public.defect_reports;
CREATE POLICY defect_reports_select ON public.defect_reports
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS defect_reports_insert ON public.defect_reports;
CREATE POLICY defect_reports_insert ON public.defect_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND (
      (public.is_admin_manager_or_vmu() AND user_id = auth.uid())
      OR (
        user_id = auth.uid()
        AND submission_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.precheck_submissions s
          WHERE s.id = defect_reports.submission_id
            AND s.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS defect_reports_update_vmu ON public.defect_reports;
CREATE POLICY defect_reports_update_vmu ON public.defect_reports
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin_manager_or_vmu())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

DROP POLICY IF EXISTS defect_activity_log_select ON public.defect_activity_log;
CREATE POLICY defect_activity_log_select ON public.defect_activity_log
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS defect_activity_log_insert ON public.defect_activity_log;
CREATE POLICY defect_activity_log_insert ON public.defect_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin_manager_or_vmu());

-- ---------------------------------------------------------------------------
-- performance / awards / violations / notes / induction / rota admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS shunter_performance_select ON public.shunter_performance;
CREATE POLICY shunter_performance_select ON public.shunter_performance
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS shunter_performance_insert ON public.shunter_performance;
CREATE POLICY shunter_performance_insert ON public.shunter_performance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_performance_update ON public.shunter_performance;
CREATE POLICY shunter_performance_update ON public.shunter_performance
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_performance_delete ON public.shunter_performance;
CREATE POLICY shunter_performance_delete ON public.shunter_performance
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS monthly_shunter_awards_select ON public.monthly_shunter_awards;
CREATE POLICY monthly_shunter_awards_select ON public.monthly_shunter_awards
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user());

DROP POLICY IF EXISTS monthly_shunter_awards_insert ON public.monthly_shunter_awards;
CREATE POLICY monthly_shunter_awards_insert ON public.monthly_shunter_awards
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS monthly_shunter_awards_update ON public.monthly_shunter_awards;
CREATE POLICY monthly_shunter_awards_update ON public.monthly_shunter_awards
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS monthly_shunter_awards_delete ON public.monthly_shunter_awards;
CREATE POLICY monthly_shunter_awards_delete ON public.monthly_shunter_awards
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_violations_select ON public.shunter_violations;
CREATE POLICY shunter_violations_select ON public.shunter_violations
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND (public.is_admin() OR public.is_transport_manager() OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS shunter_violations_insert_admin ON public.shunter_violations;
CREATE POLICY shunter_violations_insert_admin ON public.shunter_violations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_violations_update_admin ON public.shunter_violations;
CREATE POLICY shunter_violations_update_admin ON public.shunter_violations
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_violations_delete_admin ON public.shunter_violations;
CREATE POLICY shunter_violations_delete_admin ON public.shunter_violations
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS user_day_notes_select ON public.user_day_notes;
CREATE POLICY user_day_notes_select ON public.user_day_notes
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND ((SELECT auth.uid()) = user_id OR public.is_admin())
  );

DROP POLICY IF EXISTS user_day_notes_insert ON public.user_day_notes;
CREATE POLICY user_day_notes_insert ON public.user_day_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND (SELECT auth.uid()) = user_id
  );

DROP POLICY IF EXISTS user_day_notes_update ON public.user_day_notes;
CREATE POLICY user_day_notes_update ON public.user_day_notes
  FOR UPDATE TO authenticated
  USING (
    public.is_approved_active_user()
    AND (SELECT auth.uid()) = user_id
  )
  WITH CHECK (
    public.is_approved_active_user()
    AND (SELECT auth.uid()) = user_id
  );

DROP POLICY IF EXISTS user_day_notes_delete ON public.user_day_notes;
CREATE POLICY user_day_notes_delete ON public.user_day_notes
  FOR DELETE TO authenticated
  USING (
    public.is_approved_active_user()
    AND (SELECT auth.uid()) = user_id
  );

DROP POLICY IF EXISTS shunter_induction_sections_select ON public.shunter_induction_sections;
CREATE POLICY shunter_induction_sections_select ON public.shunter_induction_sections
  FOR SELECT TO authenticated
  USING (
    public.is_approved_active_user()
    AND (is_published = true OR public.is_admin())
  );

DROP POLICY IF EXISTS shunter_induction_sections_insert ON public.shunter_induction_sections;
CREATE POLICY shunter_induction_sections_insert ON public.shunter_induction_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_induction_sections_update ON public.shunter_induction_sections;
CREATE POLICY shunter_induction_sections_update ON public.shunter_induction_sections
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS shunter_induction_sections_delete ON public.shunter_induction_sections;
CREATE POLICY shunter_induction_sections_delete ON public.shunter_induction_sections
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_templates_admin ON public.rota_templates;
CREATE POLICY rota_templates_admin ON public.rota_templates
  FOR ALL TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baselines_select ON public.rota_week_baselines;
CREATE POLICY rota_week_baselines_select ON public.rota_week_baselines
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baselines_insert ON public.rota_week_baselines;
CREATE POLICY rota_week_baselines_insert ON public.rota_week_baselines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baselines_update ON public.rota_week_baselines;
CREATE POLICY rota_week_baselines_update ON public.rota_week_baselines
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baselines_delete ON public.rota_week_baselines;
CREATE POLICY rota_week_baselines_delete ON public.rota_week_baselines
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baseline_slots_select ON public.rota_week_baseline_slots;
CREATE POLICY rota_week_baseline_slots_select ON public.rota_week_baseline_slots
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baseline_slots_insert ON public.rota_week_baseline_slots;
CREATE POLICY rota_week_baseline_slots_insert ON public.rota_week_baseline_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baseline_slots_update ON public.rota_week_baseline_slots;
CREATE POLICY rota_week_baseline_slots_update ON public.rota_week_baseline_slots
  FOR UPDATE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin())
  WITH CHECK (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS rota_week_baseline_slots_delete ON public.rota_week_baseline_slots;
CREATE POLICY rota_week_baseline_slots_delete ON public.rota_week_baseline_slots
  FOR DELETE TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS system_activity_log_select ON public.system_activity_log;
CREATE POLICY system_activity_log_select ON public.system_activity_log
  FOR SELECT TO authenticated
  USING (public.is_approved_active_user() AND public.is_admin());

DROP POLICY IF EXISTS system_activity_log_insert ON public.system_activity_log;
CREATE POLICY system_activity_log_insert ON public.system_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_active_user()
    AND (SELECT auth.uid()) = user_id
  );

-- profiles, locations, agencies, notifications, page_views/page_visits:
-- intentionally NOT gated here so pending users can complete profile,
-- poll Waiting, and self-delete.
