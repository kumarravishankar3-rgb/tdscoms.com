import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, font, roleColor } from '@/src/theme';
import { useAuth } from '@/src/AuthContext';
import { Avatar } from '@/src/ui';

export default function MoreScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const rows = [
    { icon: 'wallet', label: 'Accounting', route: '/accounting', color: colors.success, testID: 'row-accounting' },
    { icon: 'document-text', label: 'Tender Library', route: '/tenders', color: colors.error, testID: 'row-tenders' },
    { icon: 'people', label: 'Employees', route: '/employees', color: colors.brandPrimary, testID: 'row-employees' },
    { icon: 'calendar', label: 'Attendance & Leaves', route: '/hr', color: colors.success, testID: 'row-hr' },
    { icon: 'cash', label: 'Simple Accounts', route: '/(tabs)/business', color: colors.warning, testID: 'row-accounts' },
  ];

  const adminRows = user?.role === 'admin' ? [
    { icon: 'business', label: 'Offices (Geofence)', route: '/offices', color: colors.brandSecondary, testID: 'row-offices' },
    { icon: 'wallet', label: 'Payroll', route: '/payroll', color: colors.success, testID: 'row-payroll' },
    { icon: 'settings', label: 'Attendance Settings', route: '/attendance-settings', color: colors.info, testID: 'row-att-settings' },
  ] : [];

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="more-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.profile}>
          <Avatar name={user?.name || 'U'} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor(user?.role || 'employee') + '20' }]}>
              <Text style={[styles.roleText, { color: roleColor(user?.role || 'employee') }]}>{(user?.role || 'employee').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modules</Text>
          {rows.map(r => (
            <Pressable key={r.label} testID={r.testID} style={styles.row} onPress={() => router.push(r.route as any)}>
              <View style={[styles.rowIcon, { backgroundColor: r.color + '20' }]}>
                <Ionicons name={r.icon as any} size={20} color={r.color} />
              </View>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        {adminRows.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin</Text>
            {adminRows.map(r => (
              <Pressable key={r.label} testID={r.testID} style={styles.row} onPress={() => router.push(r.route as any)}>
                <View style={[styles.rowIcon, { backgroundColor: r.color + '20' }]}>
                  <Ionicons name={r.icon as any} size={20} color={r.color} />
                </View>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: colors.surface, padding: 2, borderWidth: 1, borderColor: colors.border }]}>
              <Image source={require('../../assets/images/company-logo.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>TDSC Office Management System</Text>
              <Text style={styles.muted}>Triveni DSC & e-Tender Service Pvt. Ltd.</Text>
            </View>
          </View>
        </View>

        <Pressable testID="logout-btn" style={styles.logout} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  profile: { flexDirection: 'row', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  name: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
  email: { color: colors.muted, fontSize: font.base, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 6 },
  roleText: { fontWeight: '800', fontSize: 10, letterSpacing: 0.4 },
  section: { marginTop: spacing.xl, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionTitle: { fontSize: font.sm, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, padding: spacing.md, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: font.lg, color: colors.onSurface, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.error + '10', borderWidth: 1, borderColor: colors.error + '30' },
  logoutText: { color: colors.error, fontWeight: '700', fontSize: font.lg },
});
