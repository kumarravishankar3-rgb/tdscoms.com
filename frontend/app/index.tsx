import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
