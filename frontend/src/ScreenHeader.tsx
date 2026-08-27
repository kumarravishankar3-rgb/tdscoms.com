import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, font } from './theme';

export const ScreenHeader: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => {
  const router = useRouter();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={styles.row}>
        <Pressable testID="header-back" onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { flex: 1, fontSize: font.xl, fontWeight: '700', color: colors.onSurface },
});
