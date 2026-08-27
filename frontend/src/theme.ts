export const colors = {
  surface: '#FFFFFF',
  onSurface: '#09090B',
  surfaceSecondary: '#F4F4F5',
  onSurfaceSecondary: '#18181B',
  surfaceTertiary: '#E4E4E7',
  onSurfaceTertiary: '#27272A',
  surfaceInverse: '#09090B',
  onSurfaceInverse: '#FFFFFF',
  brand: '#0A5CFF',
  brandPrimary: '#0A5CFF',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#2563EB',
  brandTertiary: '#DBEAFE',
  onBrandTertiary: '#1D4ED8',
  success: '#10B981',
  onSuccess: '#FFFFFF',
  warning: '#F59E0B',
  onWarning: '#FFFFFF',
  error: '#EF4444',
  onError: '#FFFFFF',
  info: '#3B82F6',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  divider: '#F4F4F5',
  muted: '#71717A',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  display: 30,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const roleColor = (role: string) => {
  if (role === 'admin') return colors.error;
  if (role === 'manager') return colors.brandPrimary;
  return colors.success;
};
