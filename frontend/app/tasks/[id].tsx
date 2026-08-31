import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, tokenStore } from '@/src/api';
import { Card, PrimaryButton, ScreenLoader, SecondaryButton, StatusBadge } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';
import { confirm, notify } from '@/src/dialog';

const MAX = 10 * 1024 * 1024;
const humanSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [t, setT] = useState<any | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addStage, setAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [moveTo, setMoveTo] = useState<any | null>(null);
  const [moveNote, setMoveNote] = useState('');
  const [moveAssignee, setMoveAssignee] = useState<any | null>(null);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [task, emps] = await Promise.all([api.get<any>(`/tasks/${id}`), api.get<any[]>('/employees').catch(() => [])]);
      setT(task); setEmployees(emps);
    } catch {}
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canEdit = user?.role === 'admin' || user?.role === 'manager' || t?.created_by === user?.user_id || t?.assignee_id === user?.user_id;

  const addStageSave = async () => {
    if (!newStageName.trim()) return;
    try { const updated = await api.post<any>(`/tasks/${id}/stages`, { name: newStageName.trim() }); setT(updated); setNewStageName(''); setAddStage(false); }
    catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
  };

  const deleteStage = (s: any) => {
    Alert.alert('Delete stage?', `"${s.name}" will be removed from this task.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { const u = await api.del<any>(`/tasks/${id}/stages/${s.id}`); setT(u); } catch {} } },
    ]);
  };

  const doMove = async () => {
    if (!moveTo) return;
    setMoving(true);
    try {
      const updated = await api.post<any>(`/tasks/${id}/move-stage`, {
        stage_id: moveTo.id,
        note: moveNote.trim() || null,
        assignee_id: moveAssignee?.id || t?.assignee_id || null,
        assignee_name: moveAssignee?.name || t?.assignee_name || null,
      });
      setT(updated); setMoveTo(null); setMoveNote(''); setMoveAssignee(null);
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    finally { setMoving(false); }
  };

  const toggleSub = async (subId: string) => {
    const subs = (t.sub_tasks || []).map((s: any) => s.id === subId ? { ...s, done: !s.done } : s);
    try { const u = await api.patch<any>(`/tasks/${id}`, { sub_tasks: subs }); setT(u); } catch {}
  };

  const pickAndUpload = async () => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (res.canceled || !res.assets?.length) return;
      setUploading(true);
      let updated: any = t;
      for (const asset of res.assets) {
        if (asset.size && asset.size > MAX) { setErr(`"${asset.name}" > 10 MB. Skipped.`); continue; }
        try { updated = await api.uploadTaskFile(String(id), { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' }); }
        catch (e: any) { setErr(e?.message || `Upload failed`); }
      }
      if (updated) setT(updated);
    } finally { setUploading(false); }
  };

  const removeAttachment = async (path: string) => {
    try { const u = await api.del<any>(`/tasks/${id}/attachments?path=${encodeURIComponent(path)}`); setT(u); } catch {}
  };

  const openFile = async (path: string) => {
    const token = await tokenStore.get();
    const url = `${api.base}/api/files/${path}?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else { const Linking = await import('expo-linking'); await Linking.openURL(url); }
  };

  if (!t) return (<View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }}><ScreenHeader title="Task" /><ScreenLoader /></View>);

  const stages: any[] = t.stages || [];
  const currentIdx = stages.findIndex((s: any) => s.id === t.current_stage_id);
  const prev = currentIdx > 0 ? stages[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;
  const attachments: any[] = t.attachments || [];
  const subs: any[] = t.sub_tasks || [];
  const doneSubs = subs.filter(s => s.done).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="task-detail">
      <ScreenHeader title={t.task_no || 'Task'} right={(
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {(user?.role === 'admin' || user?.role === 'manager') ? (
            <Pressable testID="edit-task-hdr" hitSlop={8} onPress={() => router.push({ pathname: '/tasks/new', params: { edit_id: id } } as any)}>
              <Ionicons name="create-outline" size={22} color="#B45309" />
            </Pressable>
          ) : null}
          {user?.role === 'admin' ? (
            <Pressable testID="del-task-hdr" hitSlop={8} onPress={async () => {
              const ok = await confirm('Delete Task?', `${t.task_no} delete kar diya jayega. Yeh action undo nahi ho sakta.`, { confirmText: 'Delete', destructive: true });
              if (!ok) return;
              try { await api.del(`/tasks/${id}`); router.back(); }
              catch (e: any) { notify('Failed', e?.message || 'Try again'); }
            }}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </Pressable>
          ) : null}
        </View>
      )} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.taskNo}>{t.task_no}</Text>
              <Text style={styles.title}>{t.title}</Text>
              {t.task_type_name ? <View style={styles.typeTag}><Text style={styles.typeText}>{t.task_type_name}</Text></View> : null}
              {t.description ? <Text style={styles.desc}>{t.description}</Text> : null}
            </View>
            <StatusBadge status={t.status} />
          </View>
          <View style={styles.meta}>
            <Ionicons name="person" size={14} color={colors.muted} />
            <Text style={styles.metaText}>{t.assignee_name || 'Unassigned'}</Text>
            {t.deadline ? (<><Ionicons name="calendar" size={14} color={colors.muted} style={{ marginLeft: 12 }} /><Text style={styles.metaText}>{t.deadline}</Text></>) : null}
          </View>
          {(t.total_amount || 0) > 0 ? (
            <View style={styles.amountsRow}>
              <View style={styles.amount}><Text style={styles.amountLbl}>Total</Text><Text style={styles.amountVal}>₹ {Number(t.total_amount).toLocaleString('en-IN')}</Text></View>
              <View style={styles.amount}><Text style={styles.amountLbl}>Paid</Text><Text style={[styles.amountVal, { color: colors.success }]}>₹ {Number(t.paid_amount || 0).toLocaleString('en-IN')}</Text></View>
              <View style={styles.amount}><Text style={styles.amountLbl}>Dues</Text><Text style={[styles.amountVal, { color: (t.dues_amount || 0) > 0 ? colors.error : colors.success }]}>₹ {Number(t.dues_amount || 0).toLocaleString('en-IN')}</Text></View>
            </View>
          ) : null}
          {t.voucher_no ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <Ionicons name="receipt" size={14} color={colors.muted} />
              <Text style={styles.metaText}>{t.voucher_no}{t.voucher_date ? ` • ${t.voucher_date}` : ''}</Text>
            </View>
          ) : null}
        </Card>

        {t.customer_id || t.customer_name ? (
          <Card>
            <Text style={styles.sectionTitle}>Customer Details</Text>
            <View style={{ gap: 4, marginTop: 6 }}>
              <View style={styles.custRow}><Text style={styles.custLbl}>Customer ID</Text><Text style={styles.custVal}>{t.customer_code || '—'}</Text></View>
              <View style={styles.custRow}><Text style={styles.custLbl}>Name</Text><Text style={styles.custVal}>{t.customer_name || '—'}</Text></View>
              <View style={styles.custRow}><Text style={styles.custLbl}>Mobile</Text><Text style={styles.custVal}>{t.customer_mobile || '—'}</Text></View>
              <View style={styles.custRow}><Text style={styles.custLbl}>PAN</Text><Text style={styles.custVal}>{t.customer_pan || '—'}</Text></View>
              <View style={styles.custRow}><Text style={styles.custLbl}>Address</Text><Text style={[styles.custVal, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{t.customer_address || '—'}</Text></View>
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.sectionTitle}>Workflow</Text>
            <Pressable testID="add-stage" onPress={() => setAddStage(true)} style={styles.smallAdd} hitSlop={10}>
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.smallAddText}>Stage</Text>
            </Pressable>
          </View>
          {stages.length === 0 ? (
            <View style={styles.emptyStages}>
              <Ionicons name="git-branch-outline" size={28} color={colors.muted} />
              <Text style={styles.muted}>No stages yet. Tap + Stage to build the workflow.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepper}>
              {stages.map((s, i) => {
                const active = s.id === t.current_stage_id;
                const passed = currentIdx > -1 && i < currentIdx;
                return (
                  <React.Fragment key={s.id}>
                    <Pressable testID={`stage-${s.id}`} onLongPress={() => canEdit && deleteStage(s)} onPress={() => canEdit && setMoveTo(s)} style={[styles.stage, active && styles.stageActive, passed && styles.stagePassed]}>
                      <View style={[styles.stageDot, active && styles.stageDotActive, passed && styles.stageDotPassed]}>
                        {passed ? <Ionicons name="checkmark" size={12} color={colors.onSuccess} /> : <Text style={[styles.stageNum, active && { color: colors.onBrandPrimary }]}>{i + 1}</Text>}
                      </View>
                      <Text style={[styles.stageName, active && { color: colors.brandPrimary, fontWeight: '800' }]} numberOfLines={2}>{s.name}</Text>
                    </Pressable>
                    {i < stages.length - 1 ? <View style={[styles.connector, passed && { backgroundColor: colors.success }]} /> : null}
                  </React.Fragment>
                );
              })}
            </ScrollView>
          )}
          {stages.length > 0 && canEdit ? (
            <View style={styles.moveRow}>
              <SecondaryButton icon="chevron-back" label={prev ? `Back: ${prev.name}` : 'Back'} onPress={() => prev && setMoveTo(prev)} style={{ flex: 1, opacity: prev ? 1 : 0.5 }} testID="move-back" />
              <PrimaryButton icon="chevron-forward" label={next ? `Forward: ${next.name}` : 'Forward'} onPress={() => next && setMoveTo(next)} style={{ flex: 1, opacity: next ? 1 : 0.5 }} testID="move-forward" />
            </View>
          ) : null}
          <Text style={styles.hint}>Tap any stage to jump forward or back. Long-press to remove a stage.</Text>
        </Card>

        {subs.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Sub-tasks • {doneSubs} / {subs.length}</Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {subs.map((s: any) => (
                <Pressable key={s.id} testID={`sub-${s.id}`} onPress={() => toggleSub(s.id)} style={styles.subRow}>
                  <View style={[styles.check, s.done && { backgroundColor: colors.success, borderColor: colors.success }]}>
                    {s.done ? <Ionicons name="checkmark" size={14} color={colors.onSuccess} /> : null}
                  </View>
                  <Text style={[{ flex: 1, color: colors.onSurface }, s.done && { textDecorationLine: 'line-through', color: colors.muted }]}>{s.title}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              <Text style={styles.muted}>{attachments.length} file{attachments.length === 1 ? '' : 's'} • Max 10 MB each</Text>
            </View>
            <Pressable testID="add-attachment" onPress={pickAndUpload} disabled={uploading} style={[styles.smallAdd, uploading && { opacity: 0.6 }]}>
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.smallAddText}>{uploading ? '…' : 'Add'}</Text>
            </Pressable>
          </View>
          {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text> : null}
          {attachments.length === 0 ? (
            <View style={styles.emptySlot}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.muted} />
              <Text style={styles.muted}>No files yet.</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {attachments.map((a: any, i: number) => (
                <View key={a.path} style={styles.fileSlot}>
                  <View style={styles.fileIcon}><Ionicons name={a.content_type?.includes('image') ? 'image' : 'document'} size={18} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurface, fontWeight: '600' }} numberOfLines={1}>{a.name}</Text>
                    <Text style={styles.muted}>{humanSize(a.size)}</Text>
                  </View>
                  <Pressable onPress={() => openFile(a.path)} style={styles.iconBtn}><Ionicons name="eye-outline" size={18} color={colors.brandPrimary} /></Pressable>
                  <Pressable onPress={() => removeAttachment(a.path)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.error} /></Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>

        {(t.stage_history || []).length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {(t.stage_history || []).slice().reverse().map((h: any, i: number) => (
                <View key={i} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.onSurface }}>{h.stage_name}</Text>
                    <Text style={styles.muted}>{h.moved_by_name || 'System'} • {new Date(h.moved_at).toLocaleString()}</Text>
                    {h.assignee_name ? <Text style={styles.muted}>→ {h.assignee_name}</Text> : null}
                    {h.note ? <Text style={styles.noteText}>“{h.note}”</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>

      {/* Add stage modal */}
      <Modal transparent visible={addStage} animationType="slide" onRequestClose={() => setAddStage(false)}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Stage</Text>
                <Pressable onPress={() => setAddStage(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
              </View>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <TextInput style={styles.input} placeholder="e.g. Documents Received" value={newStageName} onChangeText={setNewStageName} autoFocus testID="in-stage-name" />
                <PrimaryButton label="Add Stage" onPress={addStageSave} testID="save-stage" />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Move stage modal */}
      <Modal transparent visible={!!moveTo} animationType="slide" onRequestClose={() => setMoveTo(null)}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Move to "{moveTo?.name}"</Text>
                <Pressable onPress={() => setMoveTo(null)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                <Text style={styles.formLabel}>Add a note (optional)</Text>
                <TextInput style={[styles.input, { minHeight: 60 }]} multiline placeholder="Reason for moving stage…" value={moveNote} onChangeText={setMoveNote} testID="move-note" />
                <Text style={styles.formLabel}>Reassign to (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {employees.map(e => (
                    <Pressable key={e.id} testID={`reassign-${e.id}`} onPress={() => setMoveAssignee(e)} style={[styles.assn, moveAssignee?.id === e.id && styles.assnActive]}>
                      <Text style={[{ color: colors.onSurface, fontWeight: '600' }, moveAssignee?.id === e.id && { color: colors.onBrandPrimary }]}>{e.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton label="Confirm Move" onPress={doMove} loading={moving} testID="confirm-move" />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  taskNo: { color: colors.brandPrimary, fontWeight: '800', fontSize: font.sm, letterSpacing: 0.4 },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface, marginTop: 4 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  typeText: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: '700' },
  desc: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.base },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  metaText: { color: colors.muted, fontSize: font.sm },
  amountsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  amount: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: 'center' },
  amountLbl: { color: colors.muted, fontSize: font.sm },
  amountVal: { fontWeight: '800', fontSize: font.base, marginTop: 2, color: colors.onSurface },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface },
  custRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  custLbl: { color: colors.muted, fontSize: font.sm, fontWeight: '600', width: 90 },
  custVal: { color: colors.onSurface, fontWeight: '700', flex: 1, textAlign: 'right' },
  smallAdd: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  smallAddText: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: font.sm },
  emptyStages: { alignItems: 'center', padding: spacing.xl, gap: 6 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  stepper: { alignItems: 'center', paddingVertical: spacing.md, gap: 0 },
  stage: { alignItems: 'center', minWidth: 88, paddingHorizontal: 4 },
  stageActive: {},
  stagePassed: {},
  stageDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stageDotActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  stageDotPassed: { backgroundColor: colors.success, borderColor: colors.success },
  stageNum: { fontWeight: '800', color: colors.onSurface },
  stageName: { marginTop: 6, textAlign: 'center', fontSize: font.sm, color: colors.onSurface, maxWidth: 100 },
  connector: { width: 24, height: 2, backgroundColor: colors.border, marginTop: -18 },
  moveRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  hint: { color: colors.muted, fontSize: font.sm, textAlign: 'center', marginTop: spacing.sm },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  emptySlot: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', gap: 6 },
  fileSlot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  timelineRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary, marginTop: 6 },
  noteText: { color: colors.onSurface, fontStyle: 'italic', marginTop: 4, backgroundColor: colors.surfaceSecondary, padding: 6, borderRadius: 6 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface, flex: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.base, backgroundColor: colors.surface },
  formLabel: { color: colors.muted, fontSize: font.sm, fontWeight: '600' },
  assn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  assnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
});
