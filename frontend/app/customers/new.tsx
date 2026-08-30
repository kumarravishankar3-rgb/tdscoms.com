import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput } from '@/src/forms';
import { PrimaryButton } from '@/src/ui';
import { api } from '@/src/api';

type F = Record<string, string>;
const initial: F = {
  name: '', address: '', mobile: '', whatsapp: '', email: '', pan: '', aadhar: '',
  eproc2_user_id: '', eproc2_password: '', eproc2_email: '',
  railway_user_id: '', railway_password: '', railway_email: '',
  cpp_user_id: '', cpp_password: '', cpp_email: '',
  gst_no: '', gst_password: '', gst_email: '',
  epfo_user_id: '', epfo_password: '', epfo_email: '',
  other_portal_user_id: '', other_portal_password: '', other_portal_email: '',
  dsc_serial_no: '', dsc_issued_date: '', dsc_expired_date: '',
  iso_user_id: '', iso_password: '',
  gem_user_id: '', gem_password: '', gem_email: '',
  pmgsy_user_id: '', pmgsy_password: '', pmgsy_email: '',
  contractor_reg_no: '', registration_class: '', registration_validity: '',
  notes: '',
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

export default function NewCustomer() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState<F>(initial);
  const set = (k: string) => (v: string) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    const missing: string[] = [];
    if (!f.name.trim()) missing.push('Contractor Name');
    if (!f.mobile.trim()) missing.push('Mobile No.');
    if (!f.whatsapp.trim()) missing.push('WhatsApp No.');
    if (!f.pan.trim()) missing.push('PAN No.');
    if (!f.aadhar.trim()) missing.push('Aadhar No.');
    if (missing.length) { setErr('Required: ' + missing.join(', ')); return; }
    setErr(null); setOk(null); setBusy(true);
    try {
      const created = await api.post<any>('/customers', {
        ...f,
        name: f.name.trim(), mobile: f.mobile.trim(), whatsapp: f.whatsapp.trim(),
        pan: f.pan.trim().toUpperCase(), aadhar: f.aadhar.trim(),
      });
      setOk(`Saved ✓ Customer ID: ${created.customer_code || created.id}`);
      setTimeout(() => router.replace(`/customers/${created.id}` as any), 600);
    } catch (e: any) {
      // Try to parse structured duplicate detail
      let msg = e?.message || 'Failed';
      try {
        const parsed = typeof msg === 'string' && msg.startsWith('{') ? JSON.parse(msg) : null;
        if (parsed?.message) {
          const existing = parsed.existing || {};
          msg = `${parsed.message}\n\nExisting: ${existing.customer_code || ''} • ${existing.name || ''} • ${existing.mobile || ''}`;
        }
      } catch {}
      setErr(String(msg));
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="new-customer">
      <ScreenHeader title="Add Customer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <Ionicons name="information-circle" size={16} color={colors.brandPrimary} />
            <Text style={styles.noticeText}>A unique Customer ID will be auto-generated on save.</Text>
          </View>

          <Section title="Basic Details" icon="person" defaultOpen testID="sec-basic">
            <FormInput label="Contractor Name *" value={f.name} onChangeText={set('name')} placeholder="Full name" testID="in-name" />
            <FormInput label="Address" value={f.address} onChangeText={set('address')} placeholder="Full address" multiline testID="in-address" />
            <FormInput label="Mobile No. *" value={f.mobile} onChangeText={set('mobile')} placeholder="+91 9xxxxxxxxx" keyboardType="phone-pad" testID="in-mobile" />
            <FormInput label="WhatsApp Mobile No. *" value={f.whatsapp} onChangeText={set('whatsapp')} placeholder="+91 9xxxxxxxxx" keyboardType="phone-pad" testID="in-whatsapp" />
            <FormInput label="Email ID" value={f.email} onChangeText={set('email')} placeholder="name@example.com" keyboardType="email-address" testID="in-email" />
            <FormInput label="PAN No. *" value={f.pan} onChangeText={set('pan')} placeholder="AAAAA0000A" testID="in-pan" />
            <FormInput label="Aadhar No. *" value={f.aadhar} onChangeText={set('aadhar')} placeholder="XXXX XXXX XXXX" keyboardType="number-pad" testID="in-aadhar" />
          </Section>

          <Section title="eProc2 Portal" icon="cloud" testID="sec-eproc2">
            <FormInput label="eProc2 User ID" value={f.eproc2_user_id} onChangeText={set('eproc2_user_id')} testID="in-eproc2-uid" />
            <FormInput label="eProc2 Password" value={f.eproc2_password} onChangeText={set('eproc2_password')} secure testID="in-eproc2-pwd" />
            <FormInput label="Concern Email" value={f.eproc2_email} onChangeText={set('eproc2_email')} keyboardType="email-address" testID="in-eproc2-email" />
          </Section>

          <Section title="Railway Portal" icon="train" testID="sec-railway">
            <FormInput label="Railway User ID" value={f.railway_user_id} onChangeText={set('railway_user_id')} testID="in-railway-uid" />
            <FormInput label="Railway Password" value={f.railway_password} onChangeText={set('railway_password')} secure testID="in-railway-pwd" />
            <FormInput label="Concern Email" value={f.railway_email} onChangeText={set('railway_email')} keyboardType="email-address" testID="in-railway-email" />
          </Section>

          <Section title="CPP Portal" icon="link" testID="sec-cpp">
            <FormInput label="CPP User ID" value={f.cpp_user_id} onChangeText={set('cpp_user_id')} testID="in-cpp-uid" />
            <FormInput label="CPP Password" value={f.cpp_password} onChangeText={set('cpp_password')} secure testID="in-cpp-pwd" />
            <FormInput label="Concern Email" value={f.cpp_email} onChangeText={set('cpp_email')} keyboardType="email-address" testID="in-cpp-email" />
          </Section>

          <Section title="GST Portal" icon="receipt" testID="sec-gst">
            <FormInput label="GST No." value={f.gst_no} onChangeText={set('gst_no')} testID="in-gst-no" />
            <FormInput label="GST Password" value={f.gst_password} onChangeText={set('gst_password')} secure testID="in-gst-pwd" />
            <FormInput label="Concern Email" value={f.gst_email} onChangeText={set('gst_email')} keyboardType="email-address" testID="in-gst-email" />
          </Section>

          <Section title="EPFO Portal" icon="briefcase" testID="sec-epfo">
            <FormInput label="EPFO User ID" value={f.epfo_user_id} onChangeText={set('epfo_user_id')} testID="in-epfo-uid" />
            <FormInput label="EPFO Password" value={f.epfo_password} onChangeText={set('epfo_password')} secure testID="in-epfo-pwd" />
            <FormInput label="Concern Email" value={f.epfo_email} onChangeText={set('epfo_email')} keyboardType="email-address" testID="in-epfo-email" />
          </Section>

          <Section title="Any Other Portal" icon="apps" testID="sec-other">
            <FormInput label="User ID" value={f.other_portal_user_id} onChangeText={set('other_portal_user_id')} testID="in-other-uid" />
            <FormInput label="Password" value={f.other_portal_password} onChangeText={set('other_portal_password')} secure testID="in-other-pwd" />
            <FormInput label="Concern Email" value={f.other_portal_email} onChangeText={set('other_portal_email')} keyboardType="email-address" testID="in-other-email" />
          </Section>

          <Section title="Digital Signature (DSC)" icon="ribbon" testID="sec-dsc">
            <FormInput label="DSC Serial No." value={f.dsc_serial_no} onChangeText={set('dsc_serial_no')} testID="in-dsc-sn" />
            <FormInput label="DSC Issued Date" value={f.dsc_issued_date} onChangeText={set('dsc_issued_date')} placeholder="YYYY-MM-DD" testID="in-dsc-issued" />
            <FormInput label="DSC Expired Date" value={f.dsc_expired_date} onChangeText={set('dsc_expired_date')} placeholder="YYYY-MM-DD" testID="in-dsc-exp" />
          </Section>

          <Section title="ISO Portal" icon="shield-checkmark" testID="sec-iso">
            <FormInput label="ISO User ID" value={f.iso_user_id} onChangeText={set('iso_user_id')} testID="in-iso-uid" />
            <FormInput label="ISO Password" value={f.iso_password} onChangeText={set('iso_password')} secure testID="in-iso-pwd" />
          </Section>

          <Section title="GEM Portal" icon="cart" testID="sec-gem">
            <FormInput label="GEM User ID" value={f.gem_user_id} onChangeText={set('gem_user_id')} testID="in-gem-uid" />
            <FormInput label="GEM Password" value={f.gem_password} onChangeText={set('gem_password')} secure testID="in-gem-pwd" />
            <FormInput label="Concern Email" value={f.gem_email} onChangeText={set('gem_email')} keyboardType="email-address" testID="in-gem-email" />
          </Section>

          <Section title="PMGSY Site" icon="construct" testID="sec-pmgsy">
            <FormInput label="PMGSY Site User ID" value={f.pmgsy_user_id} onChangeText={set('pmgsy_user_id')} testID="in-pmgsy-uid" />
            <FormInput label="PMGSY Site Password" value={f.pmgsy_password} onChangeText={set('pmgsy_password')} secure testID="in-pmgsy-pwd" />
            <FormInput label="Concern Email" value={f.pmgsy_email} onChangeText={set('pmgsy_email')} keyboardType="email-address" testID="in-pmgsy-email" />
          </Section>

          <Section title="Contractor Registration" icon="ribbon" testID="sec-reg">
            <FormInput label="Contractor Registration No." value={f.contractor_reg_no} onChangeText={set('contractor_reg_no')} testID="in-reg-no" />
            <FormInput label="Registration Class" value={f.registration_class} onChangeText={set('registration_class')} placeholder="e.g. Class A / Class-I" testID="in-reg-class" />
            <FormInput label="Validity of Registration" value={f.registration_validity} onChangeText={set('registration_validity')} placeholder="YYYY-MM-DD" testID="in-reg-validity" />
          </Section>

          <Section title="Notes" icon="document-text" testID="sec-notes">
            <FormInput label="Additional notes" value={f.notes} onChangeText={set('notes')} multiline testID="in-notes" />
          </Section>

          {err ? <Text style={styles.err} testID="form-error">{err}</Text> : null}
          {ok ? <Text style={styles.ok} testID="form-ok">{ok}</Text> : null}
          <PrimaryButton label="Save Customer" onPress={save} loading={busy} testID="save-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  noticeText: { color: colors.onBrandTertiary, fontSize: font.sm, flex: 1 },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  err: { color: colors.error, textAlign: 'center', fontSize: font.base },
  ok: { color: colors.success, textAlign: 'center', fontWeight: '700' },
});
