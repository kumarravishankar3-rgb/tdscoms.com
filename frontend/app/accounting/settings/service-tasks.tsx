import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';

type ServiceSetting = {
  id: string; service_key: string; service_label: string;
  default_assignee_id?: string | null; default_assignee_name?: string | null;
  default_deadline_days: number; default_followup_days: number; auto_task_enabled: boolean;
};
type Employee = { id: string; name: string; employee_code?: string | null };

export default function ServiceTaskSettingsScreen() {
  const [list, setList] = useState<ServiceSetting[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [globalOn, setGlobalOn] = useState(true);
  const [editing, setEditing] = useState<ServiceSetting | null>(null);
  const [showEmp, setShowEmp] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const load = useCallback(async () => {
    try {
      const [ss, es, g] = await Promise.all([
        api.get<ServiceSetting[]>('/settings/service-tasks'),
        api.get<Employee[]>('/employees').catch(() => []),
        api.get<{ enabled: boolean }>('/settings/auto-task-toggle').catch(() => ({ enabled: true })),
      ]);
      setList(ss); setEmployees(es); setGlobalOn(!!g.enabled);
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Load failed'); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleGlobal = async (v: boolean) => {
    setGlobalOn(v);
    try { await api.put('/settings/auto-task-toggle', { enabled: v }); }
    catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); setGlobalOn(!v); }
  };

  const saveEditing = async (patch: Partial<ServiceSetting>) => {
    if (!editing) return;
    const merged = { ...editing, ...patch } as ServiceSetting;
    setBusyId(editing.id);
    try {
      const updated = await api.patch<ServiceSetting>(`/settings/service-tasks/${editing.id}`, {
        service_key: merged.service_key,
        service_label: merged.service_label,
        default_assignee_id: merged.default_assignee_id || null,
        default_assignee_name: merged.default_assignee_name || null,
        default_deadline_days: Number(merged.default_deadline_days || 7),
        default_followup_days: Number(merged.default_followup_days || 3),
        auto_task_enabled: !!merged.auto_task_enabled,
      });
      setList(prev => (prev || []).map(x => x.id === updated.id ? updated : x));
      setEditing(updated);
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    finally { setBusyId(null); }
  };

  const remove = (s: ServiceSetting) => Alert.alert('Delete Service?', s.service_label, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/settings/service-tasks/${s.id}`); setList(prev => (prev || []).filter(x => x.id !== s.id)); }
      catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    } },
  ]);

  const addNew = async () => {
    if (!newLabel.trim()) return;
    try {
      const created = await api.post<ServiceSetting>('/settings/service-tasks', {
        service_key: newLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
        service_label: newLabel.trim(),
        default_deadline_days: 7, default_followup_days: 3, auto_task_enabled: true,
      });
      setList(prev => [...(prev || []), created]);
      setAddOpen(false); setNewLabel('');
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
  };

  return (
    <View style={styles.root} testID="svc-settings">
      <ScreenHeader title="Service-wise Task Assignment" right={(
        <Pressable onPress={() => setAddOpen(true)} testID="add-svc" style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      )} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        {/* Global toggle card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.iconBox, { backgroundColor: '#DBEAFE' }]}><Ionicons name="flash" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Auto-create Tasks on Sale Voucher</Text>
              <Text style={styles.hint}>Save karte hi Service Task + Follow-up Task auto ban jayenge</Text>
            </View>
            <Switch testID="toggle-global" value={globalOn} onValueChange={toggleGlobal} trackColor={{ true: colors.brandPrimary }} />
          </View>
        </View>

        <Text style={styles.sectionHdr}>SERVICES</Text>
        {list === null ? (
          <ActivityIndicator />
        ) : list.length === 0 ? (
          <View style={styles.empty}><Text style={{ color: colors.muted }}>No services yet — tap “+”</Text></View>
        ) : (
          list.map(s => (
            <Pressable key={s.id} onPress={() => setEditing(s)} style={styles.card} testID={`svc-${s.service_key}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.iconBox, { backgroundColor: s.auto_task_enabled ? '#DCFCE7' : '#F3F4F6' }]}>
                  <Ionicons name={s.auto_task_enabled ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.auto_task_enabled ? '#059669' : colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{s.service_label}</Text>
                  <Text style={styles.hint}>
                    {s.default_assignee_name ? `👤 ${s.default_assignee_name}` : '👤 No default employee'}
                    {'  •  '}⏳ {s.default_deadline_days}d service / {s.default_followup_days}d follow-up
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Edit sheet */}
      {editing ? (
        <Modal transparent animationType="slide" visible={!!editing} onRequestClose={() => setEditing(null)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{editing.service_label}</Text>
                <Pressable onPress={() => setEditing(null)}><Ionicons name="close" size={24} color="#111827" /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                <View style={styles.row}>
                  <Text style={styles.lbl}>Auto-task enabled</Text>
                  <Switch testID="edit-enabled" value={editing.auto_task_enabled} onValueChange={(v) => saveEditing({ auto_task_enabled: v })} trackColor={{ true: colors.brandPrimary }} />
                </View>

                <Pressable onPress={() => setShowEmp(true)} style={styles.pick} testID="edit-emp">
                  <Text style={styles.lbl}>Default Employee</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.val}>{editing.default_assignee_name || 'Not set'}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </View>
                </Pressable>

                <View style={styles.row}>
                  <Text style={styles.lbl}>Service deadline (days)</Text>
                  <TextInput testID="in-service-days" keyboardType="numeric" value={String(editing.default_deadline_days)}
                    onChangeText={(v) => setEditing({ ...editing, default_deadline_days: parseInt(v || '0', 10) || 0 })}
                    onBlur={() => saveEditing({ default_deadline_days: editing.default_deadline_days })}
                    style={styles.input} />
                </View>

                <View style={styles.row}>
                  <Text style={styles.lbl}>Follow-up deadline (days)</Text>
                  <TextInput testID="in-followup-days" keyboardType="numeric" value={String(editing.default_followup_days)}
                    onChangeText={(v) => setEditing({ ...editing, default_followup_days: parseInt(v || '0', 10) || 0 })}
                    onBlur={() => saveEditing({ default_followup_days: editing.default_followup_days })}
                    style={styles.input} />
                </View>

                <Pressable onPress={() => remove(editing)} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800' }}>Delete Service</Text>
                </Pressable>
                {busyId ? <ActivityIndicator /> : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Employee picker */}
      {showEmp ? (
        <Modal transparent animationType="slide" visible={showEmp} onRequestClose={() => setShowEmp(false)}>
          <SafeAreaView edges={['top']} style={styles.root}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Pick Default Employee</Text>
              <Pressable onPress={() => setShowEmp(false)}><Ionicons name="close" size={24} color="#111827" /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 8 }}>
              <Pressable onPress={() => { saveEditing({ default_assignee_id: null, default_assignee_name: null }); setShowEmp(false); }} style={styles.empRow}>
                <View style={styles.avatar}><Ionicons name="close-circle" size={22} color={colors.error} /></View>
                <Text style={styles.title}>None (unassigned)</Text>
              </Pressable>
              {employees.map(e => (
                <Pressable key={e.id} testID={`emp-${e.id}`}
                  onPress={() => { saveEditing({ default_assignee_id: e.id, default_assignee_name: e.name }); setShowEmp(false); }}
                  style={styles.empRow}>
                  <View style={styles.avatar}><Text style={styles.avatarTxt}>{e.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{e.name}</Text>
                    {e.employee_code ? <Text style={styles.hint}>{e.employee_code}</Text> : null}
                  </View>
                  {editing?.default_assignee_id === e.id ? <Ionicons name="checkmark" size={22} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}

      {/* Add new service */}
      {addOpen ? (
        <Modal transparent animationType="fade" visible={addOpen} onRequestClose={() => setAddOpen(false)}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { borderRadius: radius.lg, margin: 24, maxHeight: 260 }]}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Add Service</Text>
                <Pressable onPress={() => setAddOpen(false)}><Ionicons name="close" size={22} color="#111827" /></Pressable>
              </View>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <Text style={styles.lbl}>Service name</Text>
                <TextInput testID="in-new-svc" value={newLabel} onChangeText={setNewLabel} placeholder="e.g. TDS Filing" style={styles.input} />
                <Pressable onPress={addNew} testID="save-new-svc" style={styles.saveBtn}><Text style={{ color: '#FFF', fontWeight: '800' }}>Add</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#111827', fontWeight: '800', fontSize: font.base },
  hint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionHdr: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: '#374151', marginTop: 4 },
  empty: { padding: 24, alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#FFF' },
  sheetTitle: { fontSize: font.xl, fontWeight: '800', color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  pick: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  lbl: { color: '#111827', fontWeight: '600' },
  val: { color: '#111827', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, fontSize: font.base, minWidth: 100, textAlign: 'right' },
  delBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', backgroundColor: colors.error, paddingVertical: 12, borderRadius: radius.md, marginTop: 8 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: '800' },
  saveBtn: { backgroundColor: colors.brandPrimary, padding: 12, borderRadius: radius.md, alignItems: 'center' },
});
