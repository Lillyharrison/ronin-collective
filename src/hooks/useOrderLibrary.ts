/**
 * useOrderLibrary — read/write hook for the global Order Library.
 *
 * The library is property-agnostic (global). RLS gates writes via
 * `public.can_edit_orders(uid)`; reads are open to all authenticated users.
 *
 * Realtime: subscribes to changes on `order_library_items` so the grid
 * stays fresh across sessions without manual refresh.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export type LibraryStatus = "preferred" | "no_longer_preferred";

export interface OrderLibraryItem {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  website_url: string | null;
  notes: string | null;
  default_quantity: string | null;
  size: string | null;
  purchase: string | null;
  status: LibraryStatus;
  substitutions_allowed: boolean;
  search_aliases: string[];
  property_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NewOrderLibraryItem = Omit<
  OrderLibraryItem,
  "id" | "created_at" | "updated_at" | "created_by"
> & { created_by?: string | null };

export function useOrderLibrary() {
  const [items, setItems] = useState<OrderLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("order_library_items")
      .select("*")
      .order("status", { ascending: true }) // 'preferred' < 'no_longer_preferred' alphabetically
      .order("name", { ascending: true })
      .limit(500);

    if (error) {
      logger.error("[useOrderLibrary] load failed", error);
      toast.error("Could not load order library.");
      setLoading(false);
      return;
    }
    setItems((data ?? []) as OrderLibraryItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`order_library_items_changes_${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_library_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const createItem = useCallback(async (input: NewOrderLibraryItem) => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast.error("You must be signed in.");
      return null;
    }
    const { data, error } = await supabase
      .from("order_library_items")
      .insert({ ...input, created_by: userId })
      .select()
      .single();
    if (error) {
      logger.error("[useOrderLibrary] create failed", error);
      toast.error(error.message ?? "Could not create item.");
      return null;
    }
    toast.success("Library item added.");
    return data as OrderLibraryItem;
  }, []);

  const updateItem = useCallback(
    async (id: string, patch: Partial<NewOrderLibraryItem>) => {
      const { data, error } = await supabase
        .from("order_library_items")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) {
        logger.error("[useOrderLibrary] update failed", error);
        toast.error(error.message ?? "Could not update item.");
        return null;
      }
      toast.success("Library item updated.");
      return data as OrderLibraryItem;
    },
    [],
  );

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("order_library_items").delete().eq("id", id);
    if (error) {
      logger.error("[useOrderLibrary] delete failed", error);
      toast.error(error.message ?? "Could not delete item.");
      return false;
    }
    toast.success("Library item removed.");
    return true;
  }, []);

  /** Upload an image to the `order-library` bucket and return its public URL. */
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      toast.error("You must be signed in.");
      return null;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("order-library").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      logger.error("[useOrderLibrary] upload failed", error);
      toast.error(error.message ?? "Image upload failed.");
      return null;
    }
    const { data } = supabase.storage.from("order-library").getPublicUrl(path);
    return data.publicUrl;
  }, []);

  return { items, loading, reload: load, createItem, updateItem, deleteItem, uploadImage };
}
