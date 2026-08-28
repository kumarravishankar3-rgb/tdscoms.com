import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, getCurrentLocation } from '@/src/api';
import { Card, EmptyState, ScreenLoader, PrimaryButton, SecondaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput } from '@/src/forms';

type F = { id?: string; name: string; address: string; lat: string; lng: string; radius_m: string };
const empty: F = { name: '', address: '', lat: '', lng: '', radius_m: '20' };

export default function OfficesScreen() {
  const [list, setList] = useState<any[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<F>(empty);
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.get<any[]>('/offices')); } catch { setList([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setForm(empty); setErr(null); setShowForm(true); };
  const openEdit = (o: any) => {
    setForm({ id: o.id, name: o.name, address: o.address || '', lat: String(o.lat), lng: String(o.lng), radius_m: String(o.radius_m || 20) });
    setErr(null); setShowForm(true);
  };

  const useMyLocation = async () => {
    setLocBusy(true);
    try {
      const loc = await getCurrentLocation();
      setForm(p => ({ ...p, lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6) }));
    } catch (e: any) { setErr(e?.message || 'Location failed'); }
    finally { setLocBusy(false); }
  };

  const save = async () => {
    const lat = parseFloat(form.lat), lng = parseFloat(form.lng);
    const radius_m = parseInt(form.radius_m || '20', 10);
    if (!form.name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) { setErr('Name, latitude and longitude are required'); return; }
    setBusy(true); setErr(null);
    try {
      const payload = { name: form.name.trim(), address: form.address, lat, lng, radius_m };
      if (form.id) await api.patch(`/offices/${form.id}`, payload);
      else await api.post('/offices', payload);
      setShowForm(false); await load();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  const remove = (o: any) => {
    Alert.alert('Delete office?', `${o.name} will be removed. Employees assigned to it will need to be reassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/offices/${o.id}`); await load(); } catch {} } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="offices-screen">
      <ScreenHeader title="Offices" right={(
        <Pressable testID="add-office" onPress={openNew} style={styles.add}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      )} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="offices-empty" icon="business-outline" title="No offices yet" subtitle="Add offices to enable punch-in geofencing" actionLabel="Add Office" onAction={openNew} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.icon}><Ionicons name="business" size={22} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.address ? <Text style={styles.muted}>{item.address}</Text> : null}
                  <Text style={styles.muted}>📍 {Number(item.lat).toFixed(6)}, {Number(item.lng).toFixed(6)} • {item.radius_m} m</Text>
                </View>
                <Pressable onPress={() => openEdit(item)} hitSlop={10} style={styles.iconBtn} testID={`edit-${item.id}`}>
                  <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
                </Pressable>
                <Pressable onPress={() => remove(item)} hitSlop={10} style={styles.iconBtn} testID={`delete-${item.id}`}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{form.id ? 'Edit Office' : 'New Office'}</Text>
                <Pressable onPress={() => setShowForm(false)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
                <FormInput label="Office Name *" value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} placeholder="Head Office, Patna" testID="in-name" />
                <FormInput label="Address" value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} placeholder="Full address" multiline testID="in-address" />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><FormInput label="Latitude *" value={form.lat} onChangeText={v => setForm(p => ({ ...p, lat: v }))} keyboardType="numeric" testID="in-lat" /></View>
                  <View style={{ flex: 1 }}><FormInput label="Longitude *" value={form.lng} onChangeText={v => setForm(p => ({ ...p, lng: v }))} keyboardType="numeric" testID="in-lng" /></View>
                </View>
                <SecondaryButton label={locBusy ? 'Fetching…' : 'Use my current location'} icon="locate" onPress={useMyLocation} testID="use-location" />
                <FormInput label="Radius (metres)" value={form.radius_m} onChangeText={v => setForm(p => ({ ...p, radius_m: v }))} keyboardType="numeric" testID="in-radius" />
                {err ? <Text style={{ color: colors.error, textAlign: 'center' }} testID="office-form-err">{err}</Text> : null}
                <PrimaryButton label="Save Office" onPress={save} loading={busy} testID="save-office" />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
});
