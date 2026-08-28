import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { useAuth } from '@/src/AuthContext';
import { PrimaryButton } from '@/src/ui';

export default function LoginScreen() {
  const { loginEmail, signup, loginGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'employee'>('employee');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      if (mode === 'login') await loginEmail(email.trim(), password);
      else await signup(email.trim(), password, name.trim() || email.split('@')[0], role);
    } catch (e: any) {
      setErr(e?.message || 'Failed');
    } finally { setBusy(false); }
  };

  const google = async () => {
    setErr(null); setBusy(true);
    try { await loginGoogle(); } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[colors.brandSecondary, colors.brandPrimary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
            <View style={styles.logo}>
              <Image source={require('../assets/images/company-logo.jpg')} style={styles.logoImg} resizeMode="contain" />
            </View>
            <Text style={styles.brand}>TDSC Office Management System</Text>
            <Text style={styles.brandSub}>Triveni DSC & e-Tender Service Pvt. Ltd.</Text>
          </LinearGradient>

          <View style={styles.card}>
            <View style={styles.tabs}>
              <Pressable testID="tab-login" onPress={() => setMode('login')} style={[styles.tab, mode === 'login' && styles.tabActive]}>
                <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Login</Text>
              </Pressable>
              <Pressable testID="tab-signup" onPress={() => setMode('signup')} style={[styles.tab, mode === 'signup' && styles.tabActive]}>
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
              </Pressable>
            </View>

            {mode === 'signup' && (
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <TextInput testID="input-name" value={name} onChangeText={setName} placeholder="Your full name" style={styles.input} />
              </View>
            )}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput testID="input-email" value={email} onChangeText={setEmail} placeholder="you@triveni.com" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput testID="input-password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry style={styles.input} />
            </View>

            {mode === 'signup' && (
              <View style={styles.field}>
                <Text style={styles.label}>Role</Text>
                <View style={styles.roleRow}>
                  {(['employee', 'manager', 'admin'] as const).map(r => (
                    <Pressable key={r} testID={`role-${r}`} style={[styles.roleChip, role === r && styles.roleChipActive]} onPress={() => setRole(r)}>
                      <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

            <PrimaryButton testID="submit-btn" label={mode === 'login' ? 'Login' : 'Create account'} onPress={submit} loading={busy} />

            <View style={styles.divider}><View style={styles.line} /><Text style={styles.dividerText}>OR</Text><View style={styles.line} /></View>

            <Pressable testID="google-btn" onPress={google} style={styles.googleBtn}>
              <Ionicons name="logo-google" size={18} color={colors.onSurface} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>

            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>Demo credentials</Text>
              <Text style={styles.demoText}>Admin: admin@triveni.com / Admin@123</Text>
              <Text style={styles.demoText}>Manager: manager@triveni.com / Manager@123</Text>
              <Text style={styles.demoText}>Employee: employee@triveni.com / Employee@123</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl, alignItems: 'center' },
  logo: { width: 88, height: 88, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, padding: 8 },
  logoImg: { width: '100%', height: '100%' },
  brand: { color: colors.onBrandPrimary, fontSize: font.xxl, fontWeight: '800' },
  brandSub: { color: colors.onBrandPrimary, opacity: 0.85, marginTop: 4, fontSize: font.base },
  card: { backgroundColor: colors.surface, marginHorizontal: spacing.lg, marginTop: -spacing.xl, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.brandPrimary },
  field: { gap: 6 },
  label: { fontSize: font.sm, color: colors.muted, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: font.lg, color: colors.onSurface, backgroundColor: colors.surface },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  roleChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleChipText: { color: colors.onSurface, fontWeight: '600', textTransform: 'capitalize' },
  roleChipTextActive: { color: colors.onBrandPrimary },
  err: { color: colors.error, fontSize: font.base, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: font.sm },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: 48, backgroundColor: colors.surface },
  googleText: { color: colors.onSurface, fontWeight: '600', fontSize: font.lg },
  demoBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  demoTitle: { fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  demoText: { fontSize: font.sm, color: colors.muted },
});
