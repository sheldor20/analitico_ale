import { supabase } from './supabase';
import type { GoalAlert } from './goal-alerts.mjs';

export type GoalAlertState = { alertKey: string; readAt: string | null; notifiedAt: string | null };
function db() { if (!supabase) throw new Error('Entre na sua conta para salvar os alertas.'); return supabase; }
async function ownerId(expectedOwner: string) {
  const { data, error } = await db().auth.getUser();
  if (error || !data.user || data.user.id !== expectedOwner) throw new Error('Sua sessão mudou. Recarregue antes de salvar os alertas.');
  return data.user.id;
}
export async function listGoalAlertStates(year: number, month: number, expectedOwner: string): Promise<GoalAlertState[]> {
  const owner = await ownerId(expectedOwner);
  const { data, error } = await db().from('commercial_goal_alert_states')
    .select('alert_key,read_at,notified_at').eq('owner_id', owner).eq('workspace_year', year).eq('month', month + 1);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ alertKey: row.alert_key, readAt: row.read_at, notifiedAt: row.notified_at }));
}
export async function saveGoalAlertState(alert: GoalAlert, action: 'read' | 'notified', expectedOwner: string): Promise<GoalAlertState> {
  const owner = await ownerId(expectedOwner);
  const { error: createError } = await db().from('commercial_goal_alert_states').upsert({
    owner_id: owner, workspace_year: alert.year, entity_id: alert.entity.id, entity_kind: alert.entity.kind,
    central: alert.entity.central, cooperative: alert.entity.cooperative || null, pa: alert.entity.pa ?? null,
    month: alert.month + 1, metric: alert.metric, alert_key: alert.key,
  }, { onConflict: 'owner_id,workspace_year,entity_id,month,metric', ignoreDuplicates: true });
  if (createError) throw new Error(createError.message);
  const { data, error } = await db().from('commercial_goal_alert_states')
    .update(action === 'read' ? { read_at: new Date().toISOString() } : { notified_at: new Date().toISOString() })
    .eq('owner_id', owner).eq('workspace_year', alert.year).eq('entity_id', alert.entity.id)
    .eq('month', alert.month + 1).eq('metric', alert.metric)
    .select('alert_key,read_at,notified_at').single();
  if (error) throw new Error(error.message);
  return { alertKey: data.alert_key, readAt: data.read_at, notifiedAt: data.notified_at };
}
