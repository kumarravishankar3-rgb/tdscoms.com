import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog.
 * Native uses Alert.alert; web falls back to window.confirm (Alert is a no-op on rn-web).
 */
export function confirm(title: string, message: string, opts: { confirmText?: string; cancelText?: string; destructive?: boolean } = {}): Promise<boolean> {
  const { confirmText = 'OK', cancelText = 'Cancel', destructive } = opts;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/** Cross-platform alert (info/error). Web fallback uses window.alert. */
export function notify(title: string, message?: string): void {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
}
