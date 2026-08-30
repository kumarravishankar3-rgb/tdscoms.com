import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { ScreenHeader } from '@/src/ScreenHeader';
import { ItemSearchModal, PickedItem } from '@/src/ItemSearchModal';

export default function ItemsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'items' | 'categories'>('items');
  const [items, setItems] = useState<any[] | null>(null);
  const [show, setShow] = useState(false);

  const load = useCallback(async () => { try { setItems(await api.get<any[]>('/items')); } catch { setItems([]); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onPick = async (_i: PickedItem) => { await load(); };
  const remove = (i: any) => Alert.alert('Delete item?', i.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api.del(`/items/${i.id}`); await load(); } catch (e: any) { Alert.alert('Failed', e?.message || 'Failed'); } } },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6FB' }} testID="items-screen">
      <ScreenHeader title="Items & Services" right={(
        <Pressable testID="add-item" onPress={() => setShow(true)} style={styles.add}>
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      )} />
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('items')} style={[styles.tab, tab === 'items' && styles.tabActive]}>
          <Text style={[styles.tabTxt, tab === 'items' && styles.tabTxtActive]}>Items</Text>
        </Pressable>
        <Pressable onPress={() => setTab('categories')} style={[styles.tab, tab === 'categories' && styles.tabActive]}>
          <Text style={[styles.tabTxt, tab === 'categories' && styles.tabTxtActive]}>Categories</Text>
        </Pressable>
      </View>
      {tab === 'items' ? (
        items === null ? (
          <View style={{ padding: 24 }}><Text style={{ color: colors.muted }}>Loading…</Text></View>
        ) : items.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Ionicons name="cube-outline" size={48} color={colors.muted} />
            <Text style={{ color: colors.muted, marginTop: 8 }}>No items yet</Text>
            <Pressable onPress={() => setShow(true)} style={[styles.add, { marginTop: 12, borderRadius: radius.md, paddingHorizontal: 16 }]}>
              <Text style={{ color: '#FFF', fontWeight: '800' }}>+ Add First Item</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList data={items} keyExtractor={i => i.id} contentContainerStyle={{ padding: spacing.md, gap: 8, paddingBottom: spacing.xxxl }}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={[styles.icon, { backgroundColor: item.is_service ? '#EDE9FE' : '#DBEAFE' }]}>
                  <Ionicons name={item.is_service ? 'construct' : 'cube'} size={22} color={item.is_service ? '#7C3AED' : colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.item_code} • ₹{item.sale_price} / {item.unit} • GST {item.tax_rate}%</Text>
                  {item.hsn_sac ? <Text style={styles.meta}>HSN/SAC: {item.hsn_sac}</Text> : null}
                </View>
                <Pressable onPress={() => remove(item)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
              </View>
            )} />
        )
      ) : (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="grid-outline" size={48} color={colors.muted} />
          <Text style={{ color: colors.muted, marginTop: 8 }}>Category management coming in Phase 2</Text>
        </View>
      )}
      <ItemSearchModal visible={show} onClose={() => setShow(false)} onPick={onPick} title="Add / Search Item" />
    </View>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.brandPrimary },
  tabTxt: { color: colors.muted, fontWeight: '700' },
  tabTxtActive: { color: colors.brandPrimary },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#111827', fontWeight: '800', fontSize: font.base },
  meta: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
});
