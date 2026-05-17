# Supabase Migration Inventory (Baseline)

This inventory is used as a compatibility baseline before any database change.
Every new migration must be reviewed against this list and include backward
compatibility notes.

## Migrations

- `20250510112711_create_rota_templates.sql`
- `20250528120000_create_user_day_notes.sql`
- `20250530_add_delete_user_function.sql`
- `20260205_add_tug_display_name.sql`
- `20260205_create_precheck_system.sql`
- `20260207_create_check_items.sql`
- `20260208_get_tug_assignments.sql`
- `20260209_add_form_session_id.sql`
- `20260209_add_na_option.sql`
- `20260210_backfill_break_locations.sql`
- `20260211_align_precheck_items_history_visibility.sql`
- `20260211_allow_precheck_history_visibility.sql`
- `20260218_create_tug_tablets.sql`
- `20260226_create_attendance_table.sql`
- `20260228_create_shunter_violations.sql`
- `20260229_precheck_damage_confirmations.sql`
- `20260230_precheck_defects_visibility_for_users.sql`
- `20260231_fix_precheck_items_select_for_all_users.sql`
- `20260301_drop_idx_unique_active_defect_per_item.sql`
- `20260302_precheck_damage_mark_resolved_by_user.sql`
- `20260303_precheck_damage_fixed_confirmations.sql`
- `20260304_get_admin_profiles_with_emails.sql`
- `20260304_transport_manager_role_and_policies.sql`
- `20260304100000_add_role_to_get_admin_profiles.sql`
- `20260306000000_system_activity_log.sql`
- `20260306000001_claim_shift_activity_log.sql`
- `20260310000000_add_show_manage_breaks_button_setting.sql`
- `20260323120000_shunter_induction_guide.sql`
