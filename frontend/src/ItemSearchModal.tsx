import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from './theme';
import { api } from './api';
import { FormInput } from './forms';

export type PickedItem = {
  id: string; item_code?: string | null; name: string; unit: string; hsn_sac?: string | null;
  sale_price: number; purchase_price: number; tax_rate: number; is_service: boolean; stock: number;
};

export const ItemSearchModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onPick: (i: PickedItem) => void;
  title?: string;
}> = ({ visible, onClose, onPick, title = 'Add Item' }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState<PickedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = async (query: string) => {
    setLoading(true);
    try {
      const r = await api.get<PickedItem[]>(`/items${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setList(r);
    } catch { setList([]); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!visible) { setQ(''); setShowAdd(false); return; }
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, visible]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#111827" /></Pressable>
          <Text style={styles.title}>{title}</Text>
          <Pressable testID="add-new-item" onPress={() => setShowAdd(true)} style={styles.addBtn}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.addBtnTxt}>New</Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="item-search"
            autoFocus
            placeholder="Search item / service / HSN"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
          />
          <Pressable hitSlop={10} onPress={() => Alert.alert('Barcode Scanner', 'Barcode scanning will be enabled on native build. For now, please search by name/HSN.')}>
            <Ionicons name="barcode-outline" size={22} color={colors.brandPrimary} />
          </Pressable>
        </View>
        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTxt}>{q ? 'No match found' : 'No items yet'}</Text>
            <Pressable onPress={() => setShowAdd(true)} style={styles.emptyBtn}><Text style={styles.emptyBtnTxt}>+ Add New Item</Text></Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: spacing.md, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable testID={`item-${item.id}`} onPress={() => { onPick(item); onClose(); }} style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: item.is_service ? '#EDE9FE' : '#DBEAFE' }]}>
                  <Ionicons name={item.is_service ? 'construct' : 'cube'} size={20} color={item.is_service ? '#7C3AED' : colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.item_code || '—'} • ₹{item.sale_price} / {item.unit} • GST {item.tax_rate}%</Text>
                </View>
                <Text style={styles.stock}>{item.is_service ? 'Service' : `Stock: ${item.stock}`}</Text>
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
      {showAdd ? (
        <AddItemModal visible={showAdd} initialName={q} onClose={() => setShowAdd(false)}
          onCreated={(i) => { setShowAdd(false); onPick(i); onClose(); }} />
      ) : null}
    </Modal>
  );
};

const AddItemModal: React.FC<{ visible: boolean; initialName?: string; onClose: () => void; onCreated: (i: PickedItem) => void; }>
  = ({ visible, initialName, onClose, onCreated }) => {
  const [f, setF] = useState({ name: initialName || '', unit: 'PCS', hsn_sac: '', sale_price: '', tax_rate: '18', is_service: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (visible) setF(p => ({ ...p, name: initialName || '' })); }, [visible, initialName]);

  const save = async () => {
    if (!f.name.trim() || !f.sale_price) { setErr('Name and sale price required'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.post<PickedItem>('/items', {
        name: f.name.trim(), unit: f.unit || 'PCS', hsn_sac: f.hsn_sac || null,
        sale_price: parseFloat(f.sale_price) || 0, purchase_price: 0,
        tax_rate: parseFloat(f.tax_rate) || 0, is_service: f.is_service, stock: 0, low_stock_alert: 0,
      });
      onCreated(r);
    } catch (e: any) {
      const msg = String(e?.message || 'Failed');
      if (msg.includes('already exists')) { Alert.alert('Duplicate Item', msg); }
      setErr(msg);
    } finally { setBusy(false); }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Add New Item</Text>
              <Pressable onPress={onClose}><Ionicons name="close" size={22} color="#111827" /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setF(p => ({ ...p, is_service: false }))} style={[styles.toggle, !f.is_service && styles.toggleActive]}>
                  <Text style={[styles.toggleTxt, !f.is_service && styles.toggleTxtActive]}>Product</Text>
                </Pressable>
                <Pressable onPress={() => setF(p => ({ ...p, is_service: true }))} style={[styles.toggle, f.is_service && styles.toggleActive]}>
                  <Text style={[styles.toggleTxt, f.is_service && styles.toggleTxtActive]}>Service</Text>
                </Pressable>
              </View>
              <FormInput label="Item Name *" value={f.name} onChangeText={v => setF(p => ({ ...p, name: v }))} testID="ai-name" />
              <FormInput label="Unit" value={f.unit} onChangeText={v => setF(p => ({ ...p, unit: v.toUpperCase() }))} testID="ai-unit" />
              <FormInput label="HSN/SAC" value={f.hsn_sac} onChangeText={v => setF(p => ({ ...p, hsn_sac: v }))} testID="ai-hsn" />
              <FormInput label="Sale Price (₹) *" value={f.sale_price} onChangeText={v => setF(p => ({ ...p, sale_price: v }))} keyboardType="numeric" testID="ai-price" />
              <FormInput label="GST Rate (%)" value={f.tax_rate} onChangeText={v => setF(p => ({ ...p, tax_rate: v }))} keyboardType="numeric" testID="ai-gst" />
              {err ? <Text style={{ color: colors.error }}>{err}</Text> : null}
              <Pressable testID="ai-save" onPress={save} disabled={busy} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
                <Text style={styles.saveBtnTxt}>{busy ? 'Saving…' : 'Save Item'}</Text>
              </Pressable>
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
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#111827', fontWeight: '700', fontSize: font.base },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  stock: { color: '#059669', fontWeight: '700', fontSize: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: font.xl, fontWeight: '800', color: '#111827' },
  toggle: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F9FAFB' },
  toggleActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  toggleTxt: { color: colors.muted, fontWeight: '700' },
  toggleTxtActive: { color: '#FFF' },
  saveBtn: { backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  saveBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: font.lg },
});
