import React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius, font } from './theme';

export const FormInput: React.FC<{
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; multiline?: boolean; testID?: string; secure?: boolean;
}> = ({ label, value, onChangeText, placeholder, keyboardType, multiline, testID, secure }) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      multiline={multiline}
      secureTextEntry={secure}
      style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      placeholderTextColor={colors.muted}
    />
  </View>
);

export const OptionRow: React.FC<{ label: string; options: string[]; value: string; onChange: (v: string) => void; testID?: string }>
  = ({ label, options, value, onChange, testID }) => (
  <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map(o => (
        <Pressable key={o} testID={`${testID}-${o}`} onPress={() => onChange(o)} style={[styles.opt, value === o && styles.optActive]}>
          <Text style={[styles.optText, value === o && styles.optTextActive]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  label: { fontSize: font.sm, color: colors.muted, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: font.lg, color: colors.onSurface, backgroundColor: colors.surface },
  opt: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optText: { color: colors.onSurface, fontWeight: '600', textTransform: 'capitalize' },
  optTextActive: { color: colors.onBrandPrimary },
});
