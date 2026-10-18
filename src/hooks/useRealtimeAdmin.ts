import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SyncPayload } from "@/services/backgroundSync";

export interface SyncRow {
  user_id:    string;
  payload:    SyncPayload;
  updated_at: string;
}

export function useRealtimeAdmin(filterUserId?: string) {
  const [dataMap, setDataMap] = useState<Record<string, SyncRow>>({});
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("user_sync_data")
        .select("user_id, payload, updated_at");
      if (filterUserId) q = q.eq("user_id", filterUserId);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, SyncRow> = {};
      (data ?? []).forEach((r: SyncRow) => { map[r.user_id] = r; });
      setDataMap(map);
    } catch (e) {
      console.error("[admin] fetch user_sync_data failed:", e);
    } finally {
      setLoading(false);
    }
  }, [filterUserId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Live updates disabled — data refreshes only on manual reload


  const getSyncData    = (uid: string) => dataMap[uid]?.payload     ?? null;
  const getLastUpdated = (uid: string) => dataMap[uid]?.updated_at  ?? null;

  return { getSyncData, getLastUpdated, loading, refresh: fetch };
}
