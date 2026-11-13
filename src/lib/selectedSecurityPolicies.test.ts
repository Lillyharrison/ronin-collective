import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0009_restrict_selected_booking_and_gantt_policies.sql', 'utf8');
const [bookings, boards] = sql.split('-- Shared links');

describe('selected security policy migration', () => {
  it('changes only the three policies covered by the two selected findings', () => {
    expect(sql.match(/ALTER POLICY/g)).toHaveLength(3);
    expect(sql).not.toMatch(/CREATE TABLE|DROP POLICY|ALTER TABLE|CREATE FUNCTION|UPDATE public|DELETE FROM/);
    expect(sql.match(/ON public\.car_wash_bookings/g)).toHaveLength(1);
    expect(sql.match(/ON public\.gantt_shared_boards/g)).toHaveLength(2);
  });
  it('binds wash requests to the caller and explicit screen access', () => {
    expect(bookings).toContain('requested_by = auth.uid()');
    expect(bookings).toContain("public.can_see_section(auth.uid(), 'car-wash')");
    expect(bookings).toContain('TO authenticated');
  });
  it('checks both the chosen house and vehicle, preserving owner and master access', () => {
    expect(bookings).toContain('location_property_id = ANY(COALESCE(p.assigned_property_ids');
    expect(bookings).toContain('v.property_id = ANY(COALESCE(p.assigned_property_ids');
    expect(bookings).toContain('v.id = vehicle_id');
    expect(bookings).toContain('v.owner_profile_id = auth.uid()');
    expect(bookings).toContain("'master_admin'::public.app_role");
    expect(bookings).toContain('NOT p.is_archived');
  });
  it('removes sign-in-only shared-board access without changing token endpoints', () => {
    expect(boards).not.toContain('auth.uid() IS NOT NULL');
    expect(boards.match(/'master_admin'::public.app_role/g)).toHaveLength(2);
    expect(boards.match(/'admin'::public.app_role/g)).toHaveLength(2);
    expect(boards).not.toContain("'manager'");
  });
});