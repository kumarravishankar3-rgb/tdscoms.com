import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, Chip, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';

const STATUSES = ['all', 'todo', 'doing', 'done'];

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await api.get<any[]>('/tasks')); } catch { setTasks([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!tasks) return null;
    if (filter === 'all') return tasks;
    return tasks.filter(t => t.status === filter);
  }, [tasks, filter]);

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="tasks-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Tasks</Text>
        <Pressable testID="add-task" style={styles.addBtn} onPress={() => router.push('/tasks/new' as any)}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {STATUSES.map(s => (
          <Chip key={s} label={s === 'all' ? 'All' : s.toUpperCase()} selected={filter === s} onPress={() => setFilter(s)} testID={`filter-${s}`} />
        ))}
      </ScrollView>

      {filtered === null ? <ScreenLoader /> : filtered.length === 0 ? (
        <EmptyState testID="tasks-empty" icon="checkmark-done-outline" title="No tasks" subtitle="Create your first task to get started" actionLabel="Create Task" onAction={() => router.push('/tasks/new' as any)} />
      ) : (
        <FlatList
          testID="task-list"
          data={filtered}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const stagesLen = (item.stages || []).length;
            const idx = (item.stages || []).findIndex((s: any) => s.id === item.current_stage_id);
            const progress = stagesLen > 0 ? Math.max(0, (idx + 1) / stagesLen) : 0;
            return (
              <Pressable testID={`task-${item.id}`} onPress={() => router.push(`/tasks/${item.id}` as any)}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  h1: { fontSize: font.display, fontWeight: '800', color: colors.onSurface },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
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
});
