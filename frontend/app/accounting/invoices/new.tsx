import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { CustomerSearchModal, PickedParty } from '@/src/CustomerSearchModal';
import { ItemSearchModal, PickedItem } from '@/src/ItemSearchModal';
import { AttachmentsSection, Attachment } from '@/src/AttachmentsSection';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, days: number) => { const t = new Date(d); t.setDate(t.getDate() + days); return t.toISOString().slice(0, 10); };
const inr = (n: any) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const TERMS = [
  { label: 'Net 15 days', days: 15 },
  { label: 'Net 30 days', days: 30 },
  { label: 'Net 45 days', days: 45 },
  { label: 'Net 60 days', days: 60 },
  { label: 'Net 90 days', days: 90 },
  { label: 'Custom', days: 0 },
];

const PAY_MODES = [
  { key: 'cash', label: 'Cash', icon: 'cash' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: 'business' },
  { key: 'cheque', label: 'Cheque', icon: 'document-text' },
  { key: 'upi', label: 'UPI', icon: 'phone-portrait' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
] as const;

type LineItem = { key: string; item_id?: string; name: string; unit: string; qty: string; price: string; tax_rate: string; discount: string };

export default function NewInvoice() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; edit_id?: string }>();
  const isPurchase = params?.type === 'purchase';
  const editId = params?.edit_id || null;

  const [paymentType, setPaymentType] = useState<'credit' | 'cash'>('credit');
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [showPayMode, setShowPayMode] = useState(false);
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [date, setDate] = useState(today());
  const [terms, setTerms] = useState<string>('Net 60 days');
  const [dueDate, setDueDate] = useState(addDays(today(), 60));
  const [showTerms, setShowTerms] = useState(false);

  const [party, setParty] = useState<PickedParty | null>(null);
  const [showPartyPick, setShowPartyPick] = useState(false);

  const [items, setItems] = useState<LineItem[]>([]);
  const [showItemPick, setShowItemPick] = useState(false);

  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [invoiceNo, setInvoiceNo] = useState<string>('AUTO'); // just display
  const [busy, setBusy] = useState(false);

  // Recompute due date when date or terms change
  useEffect(() => {
    const t = TERMS.find(x => x.label === terms);
    if (t && t.days > 0) setDueDate(addDays(date, t.days));
  }, [date, terms]);

  // Preview counter or load existing (edit mode)
  useEffect(() => {
    (async () => {
      if (editId) {
        try {
          const ex = await api.get<any>(`/invoices/${editId}`);
          setInvoiceNo(ex.invoice_no || 'EDIT');
          setPaymentType(ex.payment_type || 'credit');
          setPaymentMode(ex.payment_mode || 'cash');
          setPaidAmountInput(String(ex.paid_amount || ''));
          setDate(ex.date || today());
          setTerms(ex.payment_terms || 'Custom');
          setDueDate(ex.due_date || today());
          setParty({ id: ex.party_id, name: ex.party_name, mobile: ex.party_mobile || '', pan: '', aadhar: '', gst_no: ex.party_gst || null, customer_code: null } as any);
          setItems((ex.items || []).map((it: any, idx: number) => ({
            key: `${it.item_id || idx}-${idx}`, item_id: it.item_id || undefined,
            name: it.name, unit: it.unit || 'PCS', qty: String(it.qty || 1),
            price: String(it.price || 0), tax_rate: String(it.tax_rate || 0), discount: String(it.discount || 0),
          })));
          setNotes(ex.notes || '');
          setAttachments(ex.attachments || []);
        } catch (e: any) { Alert.alert('Load failed', String(e?.message || 'Unable to load')); }
        return;
      }
      try {
        const list = await api.get<any[]>(`/invoices?invoice_type=${isPurchase ? 'purchase' : 'sale'}`);
        const prefix = isPurchase ? 'PB' : 'SI';
        setInvoiceNo(`${prefix}-${String((list?.length || 0) + 1).padStart(4, '0')} (preview)`);
      } catch {}
    })();
  }, [isPurchase, editId]);

  const addItem = (i: PickedItem) => {
    setItems(p => [...p, {
      key: `${i.id}-${Date.now()}`,
      item_id: i.id, name: i.name, unit: i.unit,
      qty: '1', price: String(isPurchase ? i.purchase_price || i.sale_price : i.sale_price),
      tax_rate: String(i.tax_rate || 0), discount: '0',
    }]);
  };

  const updateItem = (key: string, k: keyof LineItem, v: string) => {
    setItems(p => p.map(x => x.key === key ? { ...x, [k]: v } : x));
  };
  const removeItem = (key: string) => setItems(p => p.filter(x => x.key !== key));

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, tax = 0, total = 0;
    for (const it of items) {
      const q = parseFloat(it.qty) || 0;
      const pr = parseFloat(it.price) || 0;
      const d = parseFloat(it.discount) || 0;
      const t = parseFloat(it.tax_rate) || 0;
      const line = q * pr;
      const after = Math.max(0, line - d);
      const taxAmt = (after * t) / 100;
      subtotal += line; discount += d; tax += taxAmt; total += after + taxAmt;
    }
    return { subtotal, discount, tax, total };
  }, [items]);

  // Auto-fill Paid = Total when cash mode selected
  useEffect(() => {
    if (paymentType === 'cash') setPaidAmountInput(String(totals.total || ''));
  }, [paymentType, totals.total]);

  const paidNum = useMemo(() => {
    if (paymentType === 'cash') return totals.total;
    const p = parseFloat(paidAmountInput);
    if (Number.isFinite(p) && p >= 0) return Math.min(p, totals.total);
    return 0;
  }, [paidAmountInput, paymentType, totals.total]);
  const duesNum = useMemo(() => Math.max(0, totals.total - paidNum), [totals.total, paidNum]);

  const save = async (andNew: boolean) => {
    if (!party) return Alert.alert('Customer required', 'Please select or add a customer first');
    if (items.length === 0 && totals.total === 0) {
      return Alert.alert('Add at least one item', 'You can add items or enter a total-only invoice');
    }
    setBusy(true);
    try {
      const body = {
        invoice_type: isPurchase ? 'purchase' : 'sale',
        payment_type: paymentType,
        payment_mode: paymentMode,
        date, payment_terms: terms, due_date: paymentType === 'cash' ? date : dueDate,
        party_id: party.id, party_name: party.name, party_mobile: party.mobile || null, party_gst: party.gst_no || null,
        items: items.map(it => ({
          item_id: it.item_id || null, name: it.name, unit: it.unit,
          qty: parseFloat(it.qty) || 1, price: parseFloat(it.price) || 0,
          tax_rate: parseFloat(it.tax_rate) || 0, discount: parseFloat(it.discount) || 0,
          amount: 0,
        })),
        total_amount: totals.total,
        paid_amount: paidNum,
        notes: notes || null,
      };
      const inv: any = editId ? await api.patch(`/invoices/${editId}`, body) : await api.post('/invoices', body);
      // Upload queued attachments (best-effort)
      let attachErrors = 0;
      for (const a of attachments) {
        if (a.pending && a.uri) {
          try {
            await api.uploadVoucherFile('invoices', inv.id, { uri: a.uri, name: a.name, type: a.type || 'application/octet-stream' });
          } catch { attachErrors++; }
        }
      }
      // Also create an Income record so it flows into dashboard/reports when it's a Sale
      if (!editId && !isPurchase && totals.total > 0) {
        try {
          await api.post('/income', {
            date, client_id: party.id, client_name: party.name, client_mobile: party.mobile || null,
            service_category: 'DSC Services', service_name: `Invoice ${inv.invoice_no || ''}`,
            amount: totals.total, payment_mode: paymentType === 'cash' ? 'cash' : 'bank',
            remarks: `Auto-linked to invoice ${inv.invoice_no || inv.id}`,
          });
        } catch {}
      }
      const suffix = attachErrors ? ` (${attachErrors} attachment upload failed)` : '';
      // Check if auto-tasks are enabled to show hint
      let autoHint = '';
      if (!isPurchase) {
        try {
          const t = await api.get<{ enabled: boolean }>('/settings/auto-task-toggle');
          if (t?.enabled) autoHint = '\n\n✅ 2 tasks auto-created (Service + Follow-up). Check Tasks tab.';
        } catch {}
      }
      if (andNew) {
        setParty(null); setItems([]); setNotes(''); setAttachments([]); setPaymentType('credit'); setDate(today()); setTerms('Net 60 days');
        Alert.alert('Saved', `${inv.invoice_no} saved successfully${suffix}${autoHint}`);
      } else {
        Alert.alert('Saved', `${inv.invoice_no} saved successfully${suffix}${autoHint}`, [{ text: 'View', onPress: () => router.replace(`/accounting/invoices/${inv.id}` as any) }, { text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      const msg = String(e?.message || 'Failed');
      if (msg.includes('already exists')) Alert.alert('Duplicate Invoice', 'This party already has an invoice on this date. To prevent duplicate billing, only one invoice per party per date is allowed.');
      else Alert.alert('Failed', msg);
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="new-invoice">
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFF' }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color="#111827" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{isPurchase ? 'Purchase Bill' : 'Sale Invoice'}</Text>
            <Text style={styles.headerSub}>{invoiceNo}</Text>
          </View>
          <View style={styles.segWrap}>
            <Pressable onPress={() => setPaymentType('credit')} style={[styles.seg, paymentType === 'credit' && styles.segActive]}>
              <Text style={[styles.segTxt, paymentType === 'credit' && styles.segTxtActive]}>Credit</Text>
            </Pressable>
            <Pressable onPress={() => setPaymentType('cash')} style={[styles.seg, paymentType === 'cash' && styles.segActive]}>
              <Text style={[styles.segTxt, paymentType === 'cash' && styles.segTxtActive]}>Cash</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          <View style={styles.rowGrid}>
            <Cell label="Invoice No" value={invoiceNo} disabled />
            <Cell label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="in-date" />
          </View>
          <View style={styles.rowGrid}>
            <Pressable style={styles.cell} onPress={() => setShowTerms(true)} testID="pick-terms">
              <Text style={styles.cellLbl}>Payment Terms</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.cellVal}>{terms}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.muted} />
              </View>
            </Pressable>
            <Cell label="Due On" value={paymentType === 'cash' ? date : dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" testID="in-due" />
          </View>

          {/* Party */}
          <Pressable style={styles.partyRow} onPress={() => setShowPartyPick(true)} testID="pick-party">
            <View style={styles.partyIcon}><Ionicons name={party ? 'person' : 'person-add'} size={22} color={party ? '#FFF' : '#111827'} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.partyLbl}>Customer *</Text>
              {party ? (
                <>
                  <Text style={styles.partyName}>{party.name}</Text>
                  <Text style={styles.muted}>{party.customer_code || ''} • 📱 {party.mobile}</Text>
                </>
              ) : (
                <Text style={[styles.partyName, { color: colors.muted }]}>Tap to search / add customer</Text>
              )}
            </View>
            <Ionicons name="search" size={20} color={colors.brandPrimary} />
          </Pressable>
          {party ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call" size={16} color={colors.muted} />
              <Text style={{ flex: 1, color: '#111827' }}>{party.mobile}</Text>
              <Pressable onPress={() => setParty(null)}><Text style={{ color: colors.error, fontWeight: '700' }}>Change</Text></Pressable>
            </View>
          ) : null}

          {/* Items */}
          <View style={styles.itemsHeader}>
            <Text style={styles.itemsTitle}>Add Items <Text style={{ color: colors.muted, fontWeight: '500' }}>(Optional)</Text></Text>
            <Pressable onPress={() => setShowItemPick(true)} style={styles.itemsAdd} testID="add-item">
              <Ionicons name="add" size={16} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800' }}>Add Item</Text>
            </Pressable>
          </View>
          {items.length === 0 ? (
            <Pressable style={styles.itemsEmpty} onPress={() => setShowItemPick(true)}>
              <Ionicons name="scan" size={26} color={colors.brandPrimary} />
              <Text style={{ color: colors.muted, marginTop: 4 }}>Search / scan barcode or tap “Add Item”</Text>
            </Pressable>
          ) : (
            items.map(it => (
              <View key={it.key} style={styles.itemCard} testID={`li-${it.key}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, fontWeight: '800', color: '#111827' }}>{it.name}</Text>
                  <Pressable onPress={() => removeItem(it.key)} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.error} /></Pressable>
                </View>
                <View style={styles.itemGrid}>
                  <NumCell label="Qty" value={it.qty} onChange={v => updateItem(it.key, 'qty', v)} />
                  <NumCell label={`Price (₹)`} value={it.price} onChange={v => updateItem(it.key, 'price', v)} />
                  <NumCell label={`GST %`} value={it.tax_rate} onChange={v => updateItem(it.key, 'tax_rate', v)} />
                  <NumCell label="Disc" value={it.discount} onChange={v => updateItem(it.key, 'discount', v)} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.lineTotal}>{inr(((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0) - (parseFloat(it.discount) || 0)) * (1 + (parseFloat(it.tax_rate) || 0) / 100))}</Text>
                </View>
              </View>
            ))
          )}

          {/* Payment details: Paid / Dues / Payment Mode */}
          <View style={styles.payCard} testID="pay-details">
            <Text style={styles.payHead}>PAYMENT DETAILS</Text>
            <View style={styles.rowGrid}>
              <View style={styles.cell}>
                <Text style={styles.cellLbl}>Paid Amount</Text>
                <TextInput
                  testID="in-paid"
                  keyboardType="numeric"
                  value={paidAmountInput}
                  onChangeText={setPaidAmountInput}
                  style={[styles.cellInput, { color: '#059669' }]}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLbl}>Dues (auto)</Text>
                <Text style={[styles.cellVal, { color: duesNum > 0 ? '#DC2626' : '#059669' }]}>{inr(duesNum)}</Text>
              </View>
            </View>
            <Pressable onPress={() => setShowPayMode(true)} style={styles.payModeRow} testID="pick-pay-mode">
              <View style={styles.payModeIcon}>
                <Ionicons name={(PAY_MODES.find(p => p.key === paymentMode)?.icon as any) || 'cash'} size={20} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cellLbl}>Payment Mode</Text>
                <Text style={styles.cellVal}>{PAY_MODES.find(p => p.key === paymentMode)?.label || 'Cash'}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Attachments */}
          <AttachmentsSection attachments={attachments} onChange={setAttachments} title="Attachments" hint="Bills, PO, POD, GST notes • Max 10 MB per file" />

          {/* Notes */}
          <View style={styles.notesWrap}>
            <Text style={styles.cellLbl}>Notes (optional)</Text>
            <TextInput multiline value={notes} onChangeText={setNotes} style={styles.notesInput} placeholder="Any notes / description…" placeholderTextColor={colors.muted} />
          </View>
        </ScrollView>

        {/* Bottom totals + save bar */}
        <View style={styles.bottomBar}>
          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLbl}>Total Amount</Text>
              {totals.tax > 0 ? <Text style={styles.taxLbl}>incl. GST {inr(totals.tax)}</Text> : null}
            </View>
            <Text style={styles.totalVal}>{inr(totals.total)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable disabled={busy} onPress={() => save(true)} style={[styles.btnSecondary, busy && { opacity: 0.5 }]} testID="save-new">
              <Text style={styles.btnSecondaryTxt}>Save & New</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => save(false)} style={[styles.btnPrimary, busy && { opacity: 0.5 }]} testID="save-btn">
              <Text style={styles.btnPrimaryTxt}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <CustomerSearchModal visible={showPartyPick} onClose={() => setShowPartyPick(false)} onPick={setParty} title="Search / Add Customer" />
      <ItemSearchModal visible={showItemPick} onClose={() => setShowItemPick(false)} onPick={addItem} title="Add Item" />

      {/* Payment terms modal (simple picker) */}
      {showTerms ? (
        <Pressable style={styles.termsOverlay} onPress={() => setShowTerms(false)}>
          <View style={styles.termsSheet}>
            <Text style={styles.termsTitle}>Payment Terms</Text>
            {TERMS.map(t => (
              <Pressable key={t.label} onPress={() => { setTerms(t.label); setShowTerms(false); }} style={styles.termsRow} testID={`term-${t.label}`}>
                <Text style={{ flex: 1, color: '#111827', fontWeight: '600' }}>{t.label}</Text>
                {terms === t.label ? <Ionicons name="checkmark" size={20} color={colors.brandPrimary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : null}

      {/* Payment mode modal */}
      {showPayMode ? (
        <Pressable style={styles.termsOverlay} onPress={() => setShowPayMode(false)}>
          <View style={styles.termsSheet}>
            <Text style={styles.termsTitle}>Payment Mode</Text>
            {PAY_MODES.map(m => (
              <Pressable key={m.key} onPress={() => { setPaymentMode(m.key); setShowPayMode(false); }} style={styles.termsRow} testID={`pm-${m.key}`}>
                <Ionicons name={m.icon as any} size={20} color={colors.brandPrimary} />
                <Text style={{ flex: 1, color: '#111827', fontWeight: '600', marginLeft: 10 }}>{m.label}</Text>
                {paymentMode === m.key ? <Ionicons name="checkmark" size={20} color={colors.brandPrimary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const Cell: React.FC<{ label: string; value: string; onChangeText?: (v: string) => void; placeholder?: string; disabled?: boolean; testID?: string }>
  = ({ label, value, onChangeText, placeholder, disabled, testID }) => (
  <View style={styles.cell}>
    <Text style={styles.cellLbl}>{label}</Text>
    <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} editable={!disabled}
      placeholderTextColor={colors.muted} style={[styles.cellInput, disabled && { color: colors.muted }]} />
  </View>
);

const NumCell: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <View style={styles.numCell}>
    <Text style={styles.cellLbl}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} keyboardType="numeric" style={styles.cellInput} />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6FB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 8 },
  headerTitle: { fontSize: font.xl, fontWeight: '800', color: '#111827' },
  headerSub: { color: colors.muted, fontSize: font.sm },
  segWrap: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: radius.pill, padding: 3 },
  seg: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.brandPrimary },
  segTxt: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  segTxtActive: { color: '#FFF' },
  rowGrid: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  cellLbl: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cellVal: { color: '#111827', fontSize: font.base, fontWeight: '700', paddingVertical: 6 },
  cellInput: { color: '#111827', fontSize: font.base, fontWeight: '700', paddingVertical: 6, padding: 0 },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  partyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  partyLbl: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  partyName: { color: '#111827', fontSize: font.lg, fontWeight: '800', marginTop: 2 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  itemsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  itemsTitle: { color: '#111827', fontWeight: '800', fontSize: font.lg },
  itemsAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  itemsEmpty: { alignItems: 'center', padding: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FFF' },
  itemCard: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  itemGrid: { flexDirection: 'row', gap: 6 },
  numCell: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  lineTotal: { color: '#059669', fontWeight: '800' },
  notesWrap: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  notesInput: { color: '#111827', fontSize: font.base, minHeight: 60, textAlignVertical: 'top' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLbl: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  taxLbl: { color: colors.muted, fontSize: 10 },
  totalVal: { color: '#059669', fontSize: font.xxl, fontWeight: '900' },
  btnSecondary: { flex: 1, backgroundColor: '#EFF6FF', paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  btnSecondaryTxt: { color: colors.brandPrimary, fontWeight: '800' },
  btnPrimary: { flex: 1, backgroundColor: colors.brandPrimary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  btnPrimaryTxt: { color: '#FFF', fontWeight: '800' },
  termsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  termsSheet: { backgroundColor: '#FFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  termsTitle: { fontSize: font.lg, fontWeight: '800', color: '#111827', marginBottom: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  payCard: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  payHead: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: '#374151' },
  payModeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  payModeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
});
