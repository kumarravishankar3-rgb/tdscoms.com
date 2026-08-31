import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, Chip, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';
import { useAuth } from '@/src/AuthContext';
import { confirm, notify } from '@/src/dialog';

const STATUSES = ['all', 'todo', 'doing', 'done'];

export default function TasksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin || user?.role === 'manager';

  const [tasks, setTasks] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busyBulk, setBusyBulk] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await api.get<any[]>('/tasks')); } catch { setTasks([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!tasks) return null;
    if (filter === 'all') return tasks;
    return tasks.filter(t => t.status === filter);
  }, [tasks, filter]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const allSelected = useMemo(() => filtered && filtered.length > 0 && filtered.every(t => selected[t.id]), [filtered, selected]);

  const toggleSelect = (id: string) => setSelected(p => ({ ...p, [id]: !p[id] }));
  const enterSelectMode = (initialId?: string) => {
    if (!isAdmin) return;
    setSelectMode(true);
    if (initialId) setSelected({ [initialId]: true });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelected({}); };
  const toggleSelectAll = () => {
    if (!filtered) return;
    if (allSelected) { setSelected({}); return; }
    const next: Record<string, boolean> = {};
    filtered.forEach(t => { next[t.id] = true; });
    setSelected(next);
  };

  const bulkDelete = async () => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (ids.length === 0) return;
    const ok = await confirm('Delete Selected Tasks?', `${ids.length} task${ids.length > 1 ? 's' : ''} permanently delete kar diye jayenge. Kya aap sure hain?`, { confirmText: 'Delete All', destructive: true });
    if (!ok) return;
    setBusyBulk(true);
    try {
      const res: any = await api.post('/tasks/bulk-delete', { ids });
      notify('Deleted', `${res?.deleted || 0} tasks deleted`);
      exitSelectMode();
      await load();
    } catch (e: any) { notify('Failed', e?.message || 'Try again'); }
    finally { setBusyBulk(false); }
  };

  const deleteOne = async (id: string, taskNo: string) => {
    const ok = await confirm('Delete Task?', `${taskNo} delete kar diya jayega. Yeh action undo nahi ho sakta.`, { confirmText: 'Delete', destructive: true });
    if (!ok) return;
    try { await api.del(`/tasks/${id}`); await load(); }
    catch (e: any) { notify('Failed', e?.message || 'Try again'); }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="tasks-screen">
      <View style={styles.header}>
        {selectMode ? (
          <>
            <Pressable onPress={exitSelectMode} testID="exit-select" hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.h1}>{selectedCount} selected</Text>
            <Pressable onPress={toggleSelectAll} testID="select-all" style={styles.selBtn}>
              <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={colors.brandPrimary} />
              <Text style={styles.selBtnTxt}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.h1}>Tasks</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {isAdmin ? (
                <Pressable testID="enter-select" style={styles.iconBtn} onPress={() => enterSelectMode()} hitSlop={8}>
                  <Ionicons name="checkbox-outline" size={22} color={colors.brandPrimary} />
                </Pressable>
              ) : null}
              <Pressable testID="add-task" style={styles.addBtn} onPress={() => router.push('/tasks/new' as any)}>
                <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {!selectMode ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {STATUSES.map(s => (
            <Chip key={s} label={s === 'all' ? 'All' : s.toUpperCase()} selected={filter === s} onPress={() => setFilter(s)} testID={`filter-${s}`} />
          ))}
        </ScrollView>
      ) : null}

      {filtered === null ? <ScreenLoader /> : filtered.length === 0 ? (
        <EmptyState testID="tasks-empty" icon="checkmark-done-outline" title="No tasks" subtitle="Create your first task to get started" actionLabel="Create Task" onAction={() => router.push('/tasks/new' as any)} />
      ) : (
        <FlatList
          testID="task-list"
          data={filtered}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: selectMode ? 120 : spacing.xxxl }}
          renderItem={({ item }) => {
            const stagesLen = (item.stages || []).length;
            const idx = (item.stages || []).findIndex((s: any) => s.id === item.current_stage_id);
            const progress = stagesLen > 0 ? Math.max(0, (idx + 1) / stagesLen) : 0;
            const isSelected = !!selected[item.id];
            return (
              <Pressable
                testID={`task-${item.id}`}
                onLongPress={() => enterSelectMode(item.id)}
                onPress={() => selectMode ? toggleSelect(item.id) : router.push(`/tasks/${item.id}` as any)}
              >
                <Card style={selectMode && isSelected ? { borderColor: colors.brandPrimary, borderWidth: 2 } : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {selectMode ? (
                      <Pressable onPress={() => toggleSelect(item.id)} testID={`check-${item.id}`} hitSlop={8} style={{ marginRight: 10, marginTop: 2 }}>
                        <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={24} color={isSelected ? colors.brandPrimary : colors.muted} />
                      </Pressable>
                    ) : null}
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.taskNo}>{item.task_no}</Text>
                        {item.task_type_name ? <Text style={styles.type}>• {item.task_type_name}</Text> : null}
                      </View>
                      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                      {item.assignee_name ? <Text style={styles.muted}>👤 {item.assignee_name}</Text> : null}
                      {item.deadline ? <Text style={styles.muted}>📅 Due {item.deadline}</Text> : null}
                    </View>
                    <StatusBadge status={item.status} />
                  </View>
                  {stagesLen > 0 ? (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
                      <Text style={styles.progressLabel}>Stage {Math.max(idx + 1, 0)}/{stagesLen} • {item.current_stage_name || '—'}</Text>
                    </View>
                  ) : null}
                  {(item.total_amount || 0) > 0 ? (
                    <View style={styles.amountBar}>
                      <Text style={styles.amountLbl}>Total</Text>
                      <Text style={styles.amountVal}>₹ {Number(item.total_amount).toLocaleString('en-IN')}</Text>
                      <Text style={styles.amountLbl}>• Dues</Text>
                      <Text style={[styles.amountVal, { color: (item.dues_amount || 0) > 0 ? colors.error : colors.success }]}>₹ {Number(item.dues_amount || 0).toLocaleString('en-IN')}</Text>
                    </View>
                  ) : null}
                  <View style={styles.bottomRow}>
                    <View style={[styles.priority, { backgroundColor: item.priority === 'high' ? colors.error + '20' : item.priority === 'low' ? colors.success + '20' : colors.warning + '20' }]}>
                      <Text style={{ color: item.priority === 'high' ? colors.error : item.priority === 'low' ? colors.success : colors.warning, fontSize: 10, fontWeight: '800' }}>{(item.priority || 'medium').toUpperCase()}</Text>
                    </View>
                    {(item.attachments || []).length > 0 ? (
                      <View style={styles.iconBadge}><Ionicons name="attach" size={12} color={colors.muted} /><Text style={styles.iconBadgeText}>{item.attachments.length}</Text></View>
                    ) : null}
                    {(item.sub_tasks || []).length > 0 ? (
                      <View style={styles.iconBadge}><Ionicons name="list" size={12} color={colors.muted} /><Text style={styles.iconBadgeText}>{item.sub_tasks.filter((s: any) => s.done).length}/{item.sub_tasks.length}</Text></View>
                    ) : null}
                    {!selectMode ? (
                      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        {canEdit ? (
                          <Pressable testID={`edit-${item.id}`} onPress={(e) => { e?.stopPropagation?.(); router.push({ pathname: '/tasks/new', params: { edit_id: item.id } } as any); }} style={styles.rowActBtn}>
                            <Ionicons name="create-outline" size={14} color="#B45309" />
                            <Text style={[styles.rowActTxt, { color: '#B45309' }]}>Edit</Text>
                          </Pressable>
                        ) : null}
                        {isAdmin ? (
                          <Pressable testID={`del-${item.id}`} onPress={(e) => { e?.stopPropagation?.(); deleteOne(item.id, item.task_no); }} style={[styles.rowActBtn, { backgroundColor: '#FEE2E2' }]}>
                            <Ionicons name="trash-outline" size={14} color={colors.error} />
                            <Text style={[styles.rowActTxt, { color: colors.error }]}>Delete</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      {/* Bulk-action bar */}
      {selectMode ? (
        <View style={styles.bulkBar} testID="bulk-bar">
          <Pressable testID="bulk-cancel" onPress={exitSelectMode} style={[styles.bulkBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={{ color: colors.onSurface, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <Pressable
            testID="bulk-delete"
            disabled={selectedCount === 0 || busyBulk}
            onPress={bulkDelete}
            style={[styles.bulkBtn, { backgroundColor: selectedCount === 0 ? '#CA5F5F' : colors.error, opacity: selectedCount === 0 || busyBulk ? 0.5 : 1 }]}
          >
            <Ionicons name="trash" size={16} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '800' }}>{busyBulk ? 'Deleting…' : `Delete Selected (${selectedCount})`}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 12 },
  h1: { fontSize: font.display, fontWeight: '800', color: colors.onSurface, flex: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  selBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: '#EFF6FF' },
  selBtnTxt: { color: colors.brandPrimary, fontWeight: '800', fontSize: 12 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm, height: 56, alignItems: 'center' },
  taskNo: { color: colors.brandPrimary, fontWeight: '800', fontSize: font.sm },
  type: { color: colors.muted, fontSize: font.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface, marginTop: 4 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  progressWrap: { marginTop: spacing.md, gap: 4 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brandPrimary, borderRadius: 3 },
  progressLabel: { color: colors.muted, fontSize: font.sm },
  amountBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  amountLbl: { color: colors.muted, fontSize: font.sm },
  amountVal: { color: colors.onSurface, fontWeight: '700', fontSize: font.sm },
  bottomRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, alignItems: 'center' },
  priority: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  iconBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.surfaceSecondary },
  iconBadgeText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  rowActBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#FEF3C7' },
  rowActTxt: { fontSize: 11, fontWeight: '800' },
  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, padding: spacing.lg, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: colors.border },
  bulkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md },
});
