import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from './theme';
import { api } from './api';
import { FormInput } from './forms';

export type PickedParty = {
  id: string; customer_code?: string | null; name: string; mobile: string; whatsapp?: string;
  pan?: string; aadhar?: string; email?: string | null; gst_no?: string | null; address?: string | null;
};

export const CustomerSearchModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (c: PickedParty) => void;
  onAddNew?: (created: PickedParty) => void;
  allowAdd?: boolean;
  title?: string;
}> = ({ visible, onClose, onPick, onAddNew, allowAdd = true, title = 'Select Party' }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState<PickedParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!visible) { setQ(''); setShowAdd(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<PickedParty[]>(`/customers/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) setList(r);
      } catch { if (!cancelled) setList([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, visible]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#111827" /></Pressable>
          <Text style={styles.title}>{title}</Text>
          {allowAdd ? (
            <Pressable testID="add-new-party" onPress={() => setShowAdd(true)} style={styles.addBtn}>
              <Ionicons name="add" size={18} color="#FFF" />
              <Text style={styles.addBtnTxt}>New</Text>
            </Pressable>
          ) : <View style={{ width: 44 }} />}
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="party-search"
            autoFocus
            placeholder="Name / ID / Mobile / PAN / Aadhar / Email / GST / Reg No"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
          />
          {q ? <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
        </View>
        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTxt}>{q ? 'No match found' : 'No customers yet'}</Text>
            {allowAdd ? <Pressable onPress={() => setShowAdd(true)} style={styles.emptyBtn}><Text style={styles.emptyBtnTxt}>+ Add New Party</Text></Pressable> : null}
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: spacing.md, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable testID={`party-${item.id}`} onPress={() => { onPick(item); onClose(); }} style={styles.row}>
                <View style={styles.avatar}><Text style={styles.avatarTxt}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.customer_code ? `${item.customer_code} • ` : ''}📱 {item.mobile}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                    {item.pan && item.pan !== 'NA' ? <Text style={styles.badge}>PAN: {item.pan}</Text> : null}
                    {item.gst_no ? <Text style={[styles.badge, { color: '#059669' }]}>GST</Text> : null}
                    {item.email ? <Text style={styles.badge}>✉ {item.email}</Text> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
      {showAdd ? (
        <AddPartyModal
          visible={showAdd}
          initialName={q}
          onClose={() => setShowAdd(false)}
          onCreated={(p) => { setShowAdd(false); onAddNew?.(p); onPick(p); onClose(); }}
        />
      ) : null}
    </Modal>
  );
};

export const AddPartyModal: React.FC<{
  visible: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (p: PickedParty) => void;
}> = ({ visible, initialName, onClose, onCreated }) => {
  const [f, setF] = useState({ name: initialName || '', mobile: '', pan: '', aadhar: '', email: '', gst_no: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (visible) setF(p => ({ ...p, name: initialName || '' })); }, [visible, initialName]);

  const save = async () => {
    if (!f.name.trim() || !f.mobile.trim()) { setErr('Name and Mobile are required'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post<PickedParty>('/customers/quick', {
        name: f.name.trim(), mobile: f.mobile.trim(),
        pan: f.pan || null, aadhar: f.aadhar || null, email: f.email || null,
        gst_no: f.gst_no || null, address: f.address || null,
      });
      onCreated(r);
    } catch (e: any) {
      // Try to parse structured 409 error
      const msg = String(e?.message || 'Failed');
      if (msg.includes('already exists')) {
        Alert.alert('Duplicate Party', msg);
      } else {
        try {
          const parsed = JSON.parse(msg);
          setErr(parsed.message || msg);
        } catch { setErr(msg); }
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Add New Party</Text>
              <Pressable onPress={onClose}><Ionicons name="close" size={22} color="#111827" /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              <FormInput label="Party Name *" value={f.name} onChangeText={v => setF(p => ({ ...p, name: v }))} testID="ap-name" />
              <FormInput label="Mobile *" value={f.mobile} onChangeText={v => setF(p => ({ ...p, mobile: v }))} keyboardType="phone-pad" testID="ap-mob" />
              <FormInput label="Email" value={f.email} onChangeText={v => setF(p => ({ ...p, email: v }))} keyboardType="email-address" testID="ap-email" />
              <FormInput label="GSTIN" value={f.gst_no} onChangeText={v => setF(p => ({ ...p, gst_no: v.toUpperCase() }))} testID="ap-gst" />
              <FormInput label="PAN" value={f.pan} onChangeText={v => setF(p => ({ ...p, pan: v.toUpperCase() }))} testID="ap-pan" />
              <FormInput label="Aadhar" value={f.aadhar} onChangeText={v => setF(p => ({ ...p, aadhar: v }))} keyboardType="numeric" testID="ap-aad" />
              <FormInput label="Address" value={f.address} onChangeText={v => setF(p => ({ ...p, address: v }))} multiline testID="ap-addr" />
              {err ? <Text style={{ color: colors.error }}>{err}</Text> : null}
              <Pressable testID="ap-save" onPress={save} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
                <Text style={styles.saveBtnTxt}>{busy ? 'Saving…' : 'Save Party'}</Text>
              </Pressable>
              <Text style={styles.helper}>Duplicate check runs on Mobile / PAN / Aadhar / GST / Email — creation will be blocked if any match is found.</Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: font.xl, fontWeight: '800', color: '#111827' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  addBtnTxt: { color: '#FFF', fontWeight: '800' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: spacing.md, paddingHorizontal: spacing.md, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, height: 46 },
  searchInput: { flex: 1, color: '#111827', fontSize: font.base },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: 8 },
  emptyTxt: { color: colors.muted },
  emptyBtn: { marginTop: 8, backgroundColor: colors.brandPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md },
  emptyBtnTxt: { color: '#FFF', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.onBrandTertiary, fontWeight: '800' },
  name: { color: '#111827', fontWeight: '700', fontSize: font.base },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  badge: { color: colors.muted, fontSize: 10, fontWeight: '700', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: font.xl, fontWeight: '800', color: '#111827' },
  saveBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  saveBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: font.lg },
  helper: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
