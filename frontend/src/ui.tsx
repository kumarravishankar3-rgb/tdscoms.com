import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, shadow } from './theme';

export const ScreenLoader: React.FC<{ label?: string }> = ({ label }) => (
  <View style={styles.centered} testID="screen-loader">
    <ActivityIndicator color={colors.brandPrimary} />
    {label ? <Text style={styles.mutedText}>{label}</Text> : null}
  </View>
);

export const EmptyState: React.FC<{ icon?: any; title: string; subtitle?: string; testID?: string; actionLabel?: string; onAction?: () => void }>
  = ({ icon = 'file-tray-outline', title, subtitle, actionLabel, onAction, testID }) => (
  <View style={styles.centered} testID={testID}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name={icon} size={40} color={colors.brandPrimary} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle ? <Text style={styles.mutedText}>{subtitle}</Text> : null}
    {actionLabel && onAction ? (
      <Pressable style={styles.primaryBtn} onPress={onAction} testID={`${testID}-action`}>
        <Text style={styles.primaryBtnText}>{actionLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <View style={styles.centered}>
    <Ionicons name="alert-circle" size={40} color={colors.error} />
    <Text style={styles.emptyTitle}>Something went wrong</Text>
    <Text style={styles.mutedText}>{message}</Text>
    {onRetry ? (
      <Pressable style={styles.primaryBtn} onPress={onRetry}>
        <Text style={styles.primaryBtnText}>Retry</Text>
      </Pressable>
    ) : null}
  </View>
);

export const Chip: React.FC<{ label: string; selected?: boolean; onPress?: () => void; testID?: string; color?: string }>
  = ({ label, selected, onPress, testID, color }) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    style={[styles.chip, selected && { backgroundColor: color || colors.brandPrimary, borderColor: color || colors.brandPrimary }]}
  >
    <Text style={[styles.chipText, selected && { color: colors.onBrandPrimary }]}>{label}</Text>
  </Pressable>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let bg = colors.surfaceSecondary; let fg = colors.onSurfaceSecondary;
  const s = status.toLowerCase();
  if (s === 'paid' || s === 'approved' || s === 'done' || s === 'awarded' || s === 'present') { bg = '#DCFCE7'; fg = '#065F46'; }
  else if (s === 'pending' || s === 'todo' || s === 'open') { bg = '#FEF3C7'; fg = '#92400E'; }
  else if (s === 'doing' || s === 'submitted') { bg = colors.brandTertiary; fg = colors.onBrandTertiary; }
  else if (s === 'rejected' || s === 'lost' || s === 'absent') { bg = '#FEE2E2'; fg = '#991B1B'; }
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{status.toUpperCase()}</Text>
    </View>
  );
};

export const Avatar: React.FC<{ name: string; size?: number; uri?: string | null }> = ({ name, size = 40, uri }) => {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Text style={{ color: colors.onBrandTertiary, fontWeight: '700', fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
};

export const PrimaryButton: React.FC<{ label: string; onPress: () => void; loading?: boolean; testID?: string; disabled?: boolean; style?: ViewStyle; icon?: any }>
  = ({ label, onPress, loading, testID, disabled, style, icon }) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [styles.primaryBtn, (disabled || loading) && { opacity: 0.6 }, pressed && { opacity: 0.8 }, style]}
  >
    {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
      <>
        {icon ? <Ionicons name={icon} size={18} color={colors.onBrandPrimary} style={{ marginRight: 6 }} /> : null}
        <Text style={styles.primaryBtnText}>{label}</Text>
      </>
    )}
  </Pressable>
);

export const SecondaryButton: React.FC<{ label: string; onPress: () => void; testID?: string; icon?: any; style?: ViewStyle }>
  = ({ label, onPress, testID, icon, style }) => (
  <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }, style]}>
    {icon ? <Ionicons name={icon} size={18} color={colors.brandPrimary} style={{ marginRight: 6 }} /> : null}
    <Text style={styles.secondaryBtnText}>{label}</Text>
  </Pressable>
);

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  mutedText: { color: colors.muted, fontSize: font.base, textAlign: 'center' },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: font.xl, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  chip: { paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, flexShrink: 0 },
  chipText: { color: colors.onSurface, fontSize: font.base, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  primaryBtn: { flexDirection: 'row', backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: font.lg },
  secondaryBtn: { flexDirection: 'row', backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.xl, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: colors.onBrandTertiary, fontWeight: '700', fontSize: font.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
});
