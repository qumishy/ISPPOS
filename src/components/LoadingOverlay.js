import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import { useLoading } from '../services/LoadingContext';
import { useTheme } from '../theme';

const { width, height } = Dimensions.get('window');

export default function LoadingOverlay() {
  const { loading, message, progress } = useLoading();
  const { colors } = useTheme();

  if (!loading) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.bg2 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.text, { color: colors.t1 }]}>{message || 'يرجى الانتظار...'}</Text>
        {typeof progress === 'number' && (
          <>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.t2 }]}>{progress}%</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  text: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrack: {
    marginTop: 12,
    width: 220,
    height: 8,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 5,
  },
  progressText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
  }
});
