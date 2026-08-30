import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, TextInput, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton, SecondaryButton, Chip } from '@/src/ui';
import { api } from '@/src/api';
import { CustomerSearchModal, PickedParty } from '@/src/CustomerSearchModal';

type Sub = { id: string; title: string };

export default function NewTask() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState<string>('');
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [creatingType, setCreatingType] = useState(false);

  const [subs, setSubs] = useState<Sub[]>([]);
  const [subInput, setSubInput] = useState('');

  const [voucherNo, setVoucherNo] = useState('');
  const [voucherDate, setVoucherDate] = useState('');
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [assigneeName, setAssigneeName] = useState<string>('');
  const [priority, setPriority] = useState('medium');
  const [customer, setCustomer] = useState<PickedParty | null>(null);
  const [showPartyPick, setShowPartyPick] = useState(false);

  const reloadTypes = async () => { try { setTypes(await api.get<any[]>('/task-types')); } catch {} };
  useEffect(() => {
    (async () => {
      await reloadTypes();
      try { setEmployees(await api.get<any[]>('/employees')); } catch {}
    })();
  }, []);

  const dues = useMemo(() => {
    const t = parseFloat(total || '0'), p = parseFloat(paid || '0');
    return (Number.isFinite(t) ? t : 0) - (Number.isFinite(p) ? p : 0);
  }, [total, paid]);

  const addSub = () => {
    if (!subInput.trim()) return;
    setSubs(prev => [...prev, { id: Math.random().toString(36).slice(2), title: subInput.trim() }]);
    setSubInput('');
  };
  const removeSub = (id: string) => setSubs(prev => prev.filter(s => s.id !== id));

  const createType = async () => {
    if (!newTypeName.trim()) return;
    setCreatingType(true);
    try {
      const created = await api.post<any>('/task-types', { name: newTypeName.trim() });
      await reloadTypes();
      setTypeId(created.id);
      setShowNewType(false); setNewTypeName('');
    } catch (e: any) { Alert.alert('Failed', e?.message || 'Try again'); }
    finally { setCreatingType(false); }
  };

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return; }
    setErr(null); setOk(null); setBusy(true);
    try {
      const created = await api.post<any>('/tasks', {
        title: title.trim(), description,
        task_type_id: typeId || null,
        sub_tasks: subs.map(s => ({ title: s.title, done: false })),
        voucher_no: voucherNo || null, voucher_date: voucherDate || null,
        total_amount: parseFloat(total || '0') || 0,
        paid_amount: parseFloat(paid || '0') || 0,
        deadline: deadline || null,
        assignee_id: assigneeId || null, assignee_name: assigneeName || null,
        priority,
        customer_id: customer?.id || null,
        customer_code: customer?.customer_code || null,
        customer_name: customer?.name || null,
        customer_mobile: customer?.mobile || null,
        customer_pan: customer?.pan || null,
        customer_address: customer?.address || null,
      });
      setOk(`Saved ✓ Task ${created.task_no}`);
      setTimeout(() => router.replace(`/tasks/${created.id}` as any), 600);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-task">
      <ScreenHeader title="New Task" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Ionicons name="information-circle" size={16} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>Task No. auto-generates as TSK-0001, TSK-0002…</Text>
          </View>

          <FormInput label="Title *" value={title} onChangeText={setTitle} placeholder="e.g. Renew DSC for Rakesh Contractor" testID="in-title" />
          <FormInput label="Description" value={description} onChangeText={setDescription} placeholder="Details" multiline testID="in-desc" />

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.sectionTitle}>Customer Details</Text>
              <View style={{ flex: 1 }} />
              <Pressable testID="pick-cust" onPress={() => setShowPartyPick(true)} style={styles.custPick}>
                <Ionicons name="search" size={14} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>{customer ? 'Change' : 'Search'}</Text>
              </Pressable>
            </View>
            {customer ? (
              <View style={{ gap: 4, marginTop: 8 }}>
                <View style={styles.custRow}><Text style={styles.custLbl}>Customer ID</Text><Text style={styles.custVal}>{customer.customer_code || '—'}</Text></View>
                <View style={styles.custRow}><Text style={styles.custLbl}>Name</Text><Text style={styles.custVal}>{customer.name}</Text></View>
                <View style={styles.custRow}><Text style={styles.custLbl}>Mobile</Text><Text style={styles.custVal}>{customer.mobile}</Text></View>
                <View style={styles.custRow}><Text style={styles.custLbl}>PAN</Text><Text style={styles.custVal}>{customer.pan || '—'}</Text></View>
                <View style={styles.custRow}><Text style={styles.custLbl}>Address</Text><Text style={[styles.custVal, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{customer.address || '—'}</Text></View>
                <Pressable onPress={() => setCustomer(null)} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                  <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>Remove customer</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setShowPartyPick(true)} style={styles.custEmpty}>
                <Ionicons name="person-add-outline" size={22} color={colors.brandPrimary} />
                <Text style={{ color: colors.muted, marginTop: 4, fontSize: font.sm }}>Search by ID / Name / Mobile / PAN / Aadhar / EPFO / GST / Reg No</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Task Type</Text>
            <View style={styles.typeRow}>
              {types.map(t => (
                <Pressable key={t.id} testID={`type-${t.id}`} onPress={() => setTypeId(t.id)} style={[styles.typeChip, typeId === t.id && styles.typeChipActive]}>
                  <Text style={[styles.typeChipText, typeId === t.id && { color: colors.onBrandPrimary }]}>{t.name}</Text>
                </Pressable>
              ))}
              <Pressable testID="add-type" onPress={() => setShowNewType(true)} style={[styles.typeChip, { borderStyle: 'dashed' }]}>
                <Ionicons name="add" size={14} color={colors.brandPrimary} />
                <Text style={[styles.typeChipText, { color: colors.brandPrimary }]}> New type</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Sub-tasks ({subs.length})</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={subInput} onChangeText={setSubInput} placeholder="Add a sub-task and press +" onSubmitEditing={addSub} returnKeyType="done" testID="sub-input" />
              <Pressable onPress={addSub} style={styles.addBtn} testID="sub-add">
                <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
            <View style={{ marginTop: spacing.md, gap: 6 }}>
              {subs.map((s, i) => (
                <View key={s.id} style={styles.subRow}>
                  <Text style={styles.subIdx}>{i + 1}.</Text>
                  <Text style={{ flex: 1, color: colors.onSurface }}>{s.title}</Text>
                  <Pressable onPress={() => removeSub(s.id)} hitSlop={10}>
                    <Ionicons name="close-circle" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Voucher & Amounts</Text>
            <FormInput label="Voucher No." value={voucherNo} onChangeText={setVoucherNo} testID="in-voucher" />
            <FormInput label="Voucher Date" value={voucherDate} onChangeText={setVoucherDate} placeholder="YYYY-MM-DD" testID="in-vdate" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}><FormInput label="Total Invoice (₹)" value={total} onChangeText={setTotal} keyboardType="numeric" testID="in-total" /></View>
              <View style={{ flex: 1 }}><FormInput label="Paid (₹)" value={paid} onChangeText={setPaid} keyboardType="numeric" testID="in-paid" /></View>
            </View>
            <View style={[styles.duesBox, { backgroundColor: dues > 0 ? colors.error + '15' : colors.success + '15' }]}>
              <Text style={{ color: colors.muted, fontWeight: '600' }}>Dues</Text>
              <Text style={{ color: dues > 0 ? colors.error : colors.success, fontWeight: '800', fontSize: font.lg }} testID="dues">₹ {dues.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Assign & Deadline</Text>
            <FormInput label="Deadline / Completion Date" value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" testID="in-deadline" />
            {employees.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.muted, fontSize: font.sm, fontWeight: '600', marginBottom: 6 }}>Assign to</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {employees.map(e => (
                    <Pressable key={e.id} testID={`assn-${e.id}`} onPress={() => { setAssigneeId(e.id); setAssigneeName(e.name); }}
                      style={[styles.assn, assigneeId === e.id && styles.assnActive]}>
                      <Text style={[{ fontWeight: '600', color: colors.onSurface }, assigneeId === e.id && { color: colors.onBrandPrimary }]}>{e.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <OptionRow label="Priority" options={['low', 'medium', 'high']} value={priority} onChange={setPriority} testID="prio" />
          </View>

          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          {ok ? <Text style={{ color: colors.success, textAlign: 'center', fontWeight: '700' }}>{ok}</Text> : null}
          <PrimaryButton label="Create Task" onPress={save} loading={busy} testID="save-btn" />
          <Text style={{ color: colors.muted, fontSize: font.sm, textAlign: 'center' }}>Attachments can be uploaded on the task detail page after creation.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={showNewType} animationType="slide" onRequestClose={() => setShowNewType(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task Type</Text>
              <Pressable onPress={() => setShowNewType(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              <FormInput label="Type name" value={newTypeName} onChangeText={setNewTypeName} placeholder="e.g. ISO Certificate" testID="in-new-type" />
              <PrimaryButton label="Create Type" onPress={createType} loading={creatingType} testID="save-type" />
            </View>
          </View>
        </View>
      </Modal>
      <CustomerSearchModal visible={showPartyPick} onClose={() => setShowPartyPick(false)} onPick={setCustomer} title="Search / Add Customer" />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  noticeText: { color: colors.onBrandTertiary, fontSize: font.sm, flex: 1 },
  card: { backgroundColor: colors.surface, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeChipText: { color: colors.onSurface, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: font.base, backgroundColor: colors.surface },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  subIdx: { color: colors.muted, fontWeight: '700', width: 22 },
  duesBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  assn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  assnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  custPick: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  custRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  custLbl: { color: colors.muted, fontSize: font.sm, fontWeight: '600', width: 90 },
  custVal: { color: colors.onSurface, fontWeight: '700', flex: 1, textAlign: 'right' },
  custEmpty: { alignItems: 'center', padding: 16, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: 8 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
});
