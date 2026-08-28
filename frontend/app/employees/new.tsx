import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, Pressable, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius, font } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput, OptionRow } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

type F = Record<string, string>;
const initial: F = {
  name: '', address: '', mobile: '', emergency_mobile: '', email: '',
  pan: '', aadhar: '', date_of_joining: '', date_of_birth: '',
  bank_account_no: '', bank_ifsc: '', bank_name: '', account_holder_name: '',
  designation: '', posting_branch: '', role: 'employee',
  epfo_no: '', esic_no: '',
  pay: '', da: '', hra: '', ma: '', ta: '', other1: '', other2: '',
  ded_epfo: '', ded_esic: '', ded_advance: '', ded_advance_installments: '', ded_other: '',
};

interface SectionProps { title: string; icon: any; children: React.ReactNode; defaultOpen?: boolean; testID?: string; }
const Section: React.FC<SectionProps> = ({ title, icon, children, defaultOpen, testID }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen(o => !o)} style={styles.sectionHeader} testID={testID}>
        <View style={styles.sectionIcon}><Ionicons name={icon} size={16} color={colors.brandPrimary} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open ? <View style={{ padding: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>{children}</View> : null}
    </View>
  );
};

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export default function NewEmployee() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState<F>(initial);
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const gross = useMemo(() =>
    num(f.pay) + num(f.da) + num(f.hra) + num(f.ma) + num(f.ta) + num(f.other1) + num(f.other2)
  , [f.pay, f.da, f.hra, f.ma, f.ta, f.other1, f.other2]);
  const totalDed = useMemo(() =>
    num(f.ded_epfo) + num(f.ded_esic) + num(f.ded_advance) + num(f.ded_other)
  , [f.ded_epfo, f.ded_esic, f.ded_advance, f.ded_other]);
  const net = gross - totalDed;

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPhoto({ uri: a.uri, name: a.fileName || `photo.jpg`, type: a.mimeType || 'image/jpeg' });
    } catch (e: any) { setErr(e?.message || 'Failed to pick photo'); }
  };

  const save = async () => {
    if (!f.name.trim()) { setErr('Name is required'); return; }
    if (!f.email.trim()) { setErr('Email is required'); return; }
    setErr(null); setOk(null); setBusy(true);
    try {
      const body: any = { ...f, name: f.name.trim(), email: f.email.trim() };
      // convert numeric fields
      ['pay','da','hra','ma','ta','other1','other2','ded_epfo','ded_esic','ded_advance','ded_other'].forEach(k => { body[k] = num(f[k]); });
      const created = await api.post<any>('/employees', body);
      if (photo) {
        try { await api.uploadEmployeePhoto(created.id, photo); } catch (e: any) { console.log('photo upload failed', e); }
      }
      setOk(`Saved ✓ Employee ID: ${created.employee_code}`);
      setTimeout(() => router.back(), 1000);
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-employee">
      <ScreenHeader title="Add Employee" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Ionicons name="information-circle" size={16} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>Employee ID auto-generates as TDSC + Emp# + DDMMYYYY of joining date.</Text>
          </View>

          <View style={styles.photoWrap}>
            <Pressable onPress={pickPhoto} style={styles.photoBox} testID="photo-picker">
              {photo ? (
                <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%', borderRadius: 60 }} />
              ) : (
                <>
                  <Ionicons name="camera" size={28} color={colors.muted} />
                  <Text style={styles.muted}>Add photo</Text>
                </>
              )}
            </Pressable>
          </View>

          <Section title="Basic Details" icon="person" defaultOpen testID="sec-basic">
            <FormInput label="Name of Employee *" value={f.name} onChangeText={set('name')} testID="in-name" />
            <FormInput label="Address" value={f.address} onChangeText={set('address')} multiline testID="in-address" />
            <FormInput label="Mobile No." value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" testID="in-mobile" />
            <FormInput label="Emergency Mobile No." value={f.emergency_mobile} onChangeText={set('emergency_mobile')} keyboardType="phone-pad" testID="in-emerg" />
            <FormInput label="Email ID *" value={f.email} onChangeText={set('email')} keyboardType="email-address" testID="in-email" />
            <FormInput label="PAN" value={f.pan} onChangeText={set('pan')} testID="in-pan" />
            <FormInput label="Aadhar" value={f.aadhar} onChangeText={set('aadhar')} keyboardType="number-pad" testID="in-aadhar" />
            <FormInput label="Date of Joining (DD-MM-YYYY)" value={f.date_of_joining} onChangeText={set('date_of_joining')} placeholder="01-01-2026" testID="in-doj" />
            <FormInput label="Date of Birth (DD-MM-YYYY)" value={f.date_of_birth} onChangeText={set('date_of_birth')} placeholder="15-08-1990" testID="in-dob" />
          </Section>

          <Section title="Bank Details" icon="card" testID="sec-bank">
            <FormInput label="Account No." value={f.bank_account_no} onChangeText={set('bank_account_no')} keyboardType="number-pad" testID="in-acc" />
            <FormInput label="IFSC Code" value={f.bank_ifsc} onChangeText={set('bank_ifsc')} testID="in-ifsc" />
            <FormInput label="Name of Bank" value={f.bank_name} onChangeText={set('bank_name')} testID="in-bank" />
            <FormInput label="Account Holder Name" value={f.account_holder_name} onChangeText={set('account_holder_name')} testID="in-holder" />
          </Section>

          <Section title="Employment" icon="briefcase" testID="sec-emp">
            <FormInput label="Designation" value={f.designation} onChangeText={set('designation')} testID="in-desig" />
            <FormInput label="Posting Branch" value={f.posting_branch} onChangeText={set('posting_branch')} testID="in-branch" />
            <OptionRow label="Role" options={['employee', 'manager', 'admin']} value={f.role} onChange={(v) => setF(p => ({ ...p, role: v }))} testID="role" />
            <FormInput label="EPFO No." value={f.epfo_no} onChangeText={set('epfo_no')} testID="in-epfo" />
            <FormInput label="ESIC No." value={f.esic_no} onChangeText={set('esic_no')} testID="in-esic" />
          </Section>

          <Section title="Salary Components" icon="cash" testID="sec-salary">
            <FormInput label="PAY" value={f.pay} onChangeText={set('pay')} keyboardType="numeric" testID="in-pay" />
            <FormInput label="DA" value={f.da} onChangeText={set('da')} keyboardType="numeric" testID="in-da" />
            <FormInput label="HRA" value={f.hra} onChangeText={set('hra')} keyboardType="numeric" testID="in-hra" />
            <FormInput label="MA" value={f.ma} onChangeText={set('ma')} keyboardType="numeric" testID="in-ma" />
            <FormInput label="TA" value={f.ta} onChangeText={set('ta')} keyboardType="numeric" testID="in-ta" />
            <FormInput label="Other 1" value={f.other1} onChangeText={set('other1')} keyboardType="numeric" testID="in-o1" />
            <FormInput label="Other 2" value={f.other2} onChangeText={set('other2')} keyboardType="numeric" testID="in-o2" />
            <View style={styles.grossBox}>
              <Text style={styles.grossLabel}>Gross Amount</Text>
              <Text style={styles.grossValue} testID="gross-amount">₹ {gross.toLocaleString('en-IN')}</Text>
            </View>
          </Section>

          <Section title="Deductions" icon="remove-circle" testID="sec-ded">
            <FormInput label="EPFO" value={f.ded_epfo} onChangeText={set('ded_epfo')} keyboardType="numeric" testID="in-dedepfo" />
            <FormInput label="ESIC" value={f.ded_esic} onChangeText={set('ded_esic')} keyboardType="numeric" testID="in-dedesic" />
            <FormInput label="Advance Recovery" value={f.ded_advance} onChangeText={set('ded_advance')} keyboardType="numeric" testID="in-adv" />
            <FormInput label="Installments (notes)" value={f.ded_advance_installments} onChangeText={set('ded_advance_installments')} placeholder="e.g. 3 of 6" testID="in-inst" />
            <FormInput label="Other Recovery" value={f.ded_other} onChangeText={set('ded_other')} keyboardType="numeric" testID="in-oth" />
            <View style={[styles.grossBox, { backgroundColor: colors.error + '15' }]}>
              <Text style={[styles.grossLabel, { color: colors.error }]}>Total Deductions</Text>
              <Text style={[styles.grossValue, { color: colors.error }]}>₹ {totalDed.toLocaleString('en-IN')}</Text>
            </View>
            <View style={[styles.grossBox, { backgroundColor: colors.success + '15' }]}>
              <Text style={[styles.grossLabel, { color: colors.success, fontWeight: '800' }]}>Net Total</Text>
              <Text style={[styles.grossValue, { color: colors.success }]} testID="net-total">₹ {net.toLocaleString('en-IN')}</Text>
            </View>
          </Section>

          {err ? <Text style={styles.err} testID="form-error">{err}</Text> : null}
          {ok ? <Text style={styles.ok} testID="form-ok">{ok}</Text> : null}
          <PrimaryButton label="Save Employee" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  noticeText: { color: colors.onBrandTertiary, fontSize: font.sm, flex: 1 },
  photoWrap: { alignItems: 'center', marginVertical: spacing.md },
  photoBox: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  muted: { color: colors.muted, marginTop: 4, fontSize: font.sm },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  grossBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary, marginTop: spacing.sm },
  grossLabel: { color: colors.onBrandTertiary, fontWeight: '700' },
  grossValue: { color: colors.onBrandTertiary, fontWeight: '800', fontSize: font.lg },
  err: { color: colors.error, textAlign: 'center', fontSize: font.base },
  ok: { color: colors.success, textAlign: 'center', fontWeight: '700' },
});
