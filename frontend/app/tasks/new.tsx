import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

export default function NewTask() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [f, setF] = useState({ title: '', description: '', assignee_id: '', assignee_name: '', priority: 'medium', due_date: '' });

  useEffect(() => { (async () => { try { const list = await api.get<any[]>('/employees'); setEmployees(list); } catch {} })(); }, []);

  const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) { setErr('Title is required'); return; }
    setErr(null); setBusy(true);
    try { await api.post('/tasks', { ...f, title: f.title.trim() }); router.back(); }
    catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-task">
      <ScreenHeader title="New Task" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body}>
          <FormInput label="Title*" value={f.title} onChangeText={set('title')} placeholder="Task title" testID="in-title" />
          <FormInput label="Description" value={f.description} onChangeText={set('description')} placeholder="Details" multiline testID="in-desc" />
          <FormInput label="Due date" value={f.due_date} onChangeText={set('due_date')} placeholder="YYYY-MM-DD" testID="in-due" />
          <OptionRow label="Priority" options={['low', 'medium', 'high']} value={f.priority} onChange={(v) => setF(p => ({ ...p, priority: v }))} testID="prio" />
          {employees.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Assign to</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {employees.map(e => (
                  <View key={e.id}>
                    <PriorityChip label={e.name} selected={f.assignee_id === e.id} onPress={() => setF(p => ({ ...p, assignee_id: e.id, assignee_name: e.name }))} />
                  </View>
                ))}
              </View>
            </View>
          )}
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Create Task" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

import { Pressable } from 'react-native';
import { radius } from '@/src/theme';
const PriorityChip: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => (
  <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: selected ? colors.brandPrimary : colors.surface }}>
    <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600' }}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({ body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl } });
