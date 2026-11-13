import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { type HouseRequest, type RequestLibraryItem } from './logic';
export const REQUEST_COLUMNS = 'id,name,category,quantity,notes,property_id,created_by,library_item_id,photo_url,urgent,status,order_id,created_at,ordered_at,received_at,received_by';
export const REQUEST_ORDER_COLUMNS = 'id,title,description,property_id,status,expected_delivery,delivered_at,carrier,tracking_number,tracking_url,packing_list,notes,created_at,assigned_to,property:properties(name),assignee:profiles!orders_assigned_to_fkey(full_name)';
export function useHouseRequests(house: string | null, management = false) {
  const { userId } = usePermissions(); const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['house-requests', userId, management ? 'queue' : house], enabled: !!userId && (management || !!house),
    queryFn: async () => {
      // Page through the bounded active list; received history is just seven days.
      const rows: HouseRequest[] = [];
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      for (let from = 0; ; from += 100) {
        let q = supabase.from('shopping_list_items').select(REQUEST_COLUMNS);
        if (house) q = q.eq('property_id', house);
        q = management ? q.eq('status', 'requested') : q.or(`status.in.(requested,ordered),and(status.eq.received,received_at.gte.${since})`);
        const { data, error } = await q.order('created_at').order('id').range(from, from + 99);
        if (error) throw error;
        rows.push(...((data ?? []) as HouseRequest[]));
        if ((data?.length ?? 0) < 100) break;
      }
      const people = [...new Set(rows.map(r => r.created_by).filter((v): v is string => !!v))];
      const { data: names, error } = people.length ? await supabase.from('profiles').select('id,full_name').in('id', people).limit(people.length) : { data: [], error: null };
      if (error) throw error;
      return { rows, names: new Map((names ?? []).map(p => [p.id, p.full_name])) };
    },
  });
  const badges = useQuery({ queryKey: ['request-counts', userId, house, management], enabled: !!userId && (management || !!house), queryFn: async () => {
    const counts = await Promise.all(['requested','ordered'].map(async status => {
      let q = supabase.from('shopping_list_items').select('id', { count: 'exact', head: true }).eq('status', status);
      if (house) q = q.eq('property_id', house);
      const { count, error } = await q; if (error) throw error; return count ?? 0;
    })); return { requested: counts[0], ordered: counts[1] };
  }});
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['house-requests'] }), qc.invalidateQueries({ queryKey: ['request-counts'] }), qc.invalidateQueries({ queryKey: ['request-orders'] })]); };
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`house-requests-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list_items' }, () => { void refresh(); }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, house, management]);
  return { ...query, rows: query.data?.rows ?? [], names: query.data?.names ?? new Map<string,string|null>(), counts: badges.data ?? { requested: 0, ordered: 0 }, refresh };
}
export function useRequestLibrary(userId: string | null) {
  return useQuery({ queryKey: ['request-library', userId], enabled: !!userId, queryFn: async () => {
    const rows: RequestLibraryItem[] = [];
    for (let from = 0; ; from += 100) {
      const { data, error } = await supabase.from('order_library_items').select('id,name,category,image_url,size,default_quantity').neq('status', 'no_longer_preferred').order('name').order('id').range(from, from + 99);
      if (error) throw error; rows.push(...(data ?? [])); if ((data?.length ?? 0) < 100) break;
    } return rows;
  }});
}
