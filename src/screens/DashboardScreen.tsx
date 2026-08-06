import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getWorkingDays, isCountableDay, calculateAttendanceStats } from '../utils/attendanceHelpers';
import { AttendanceHeatmap } from '../components/AttendanceHeatmap';

export default function DashboardScreen({ navigation }: any) {
  const { account } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  
  const [stats, setStats] = useState({ present: 0, absent: 0, percentage: 0 });
  const [error, setError] = useState<string | null>(null);
  
  const [trackingStart, setTrackingStart] = useState<string>('');
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [cancelledDays, setCancelledDays] = useState<Set<string>>(new Set());

  const fetchDashboardData = async () => {
    if (!account) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch user's profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('created_at, tracking_start_date')
        .eq('id', account.id)
        .single();
      if (profileErr) throw profileErr;

      // 2. Fetch global app_settings
      const { data: settingsData, error: settingsErr } = await supabase
        .from('app_settings')
        .select('tracking_period_end_date')
        .single();
      if (settingsErr) throw settingsErr;

      // 3. Fetch cancelled days
      const { data: cancelledData, error: cancelledErr } = await supabase
        .from('cancelled_days')
        .select('cancelled_date');
      if (cancelledErr) throw cancelledErr;

      const cancelledSet = new Set(cancelledData.map((d: any) => d.cancelled_date));

      // 4. Fetch attendance via RPC
      const { data: logsData, error: logsErr } = await supabase.rpc('platform_get_my_attendance', {
        p_token: account.token
      });
      if (logsErr) throw logsErr;
      
      const res = logsData as any;
      if (!res.ok) throw new Error(res.error || 'Failed to fetch attendance logs');
      
      const userLogs = res.data || [];
      setLogs(userLogs);

      // 5. Calculate Stats
      const trackingStartStr = profileData.tracking_start_date || profileData.created_at.split('T')[0];
      const endDateObj = settingsData?.tracking_period_end_date ? new Date(settingsData.tracking_period_end_date) : new Date();
      
      setTrackingStart(trackingStartStr);
      setEndDate(endDateObj);
      setCancelledDays(cancelledSet);
      
      let presentCount = 0;
      let absentCount = 0;
      
      const today = new Date();
      const end = endDateObj < today ? endDateObj : today;

      // Count working days
      for (let d = new Date(trackingStartStr); d <= end; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().split('T')[0];
        
        // Skip weekends
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
        
        // Skip cancelled days
        if (!isCountableDay(dayStr, trackingStartStr, cancelledSet)) continue;

        // Check if present
        const wasPresent = userLogs.some((log: any) => log.verified_at.startsWith(dayStr));
        if (wasPresent) {
          presentCount++;
        } else {
          absentCount++;
        }
      }

      const totalCountable = presentCount + absentCount;
      const percentage = totalCountable > 0 ? (presentCount / totalCountable) * 100 : 0;

      setStats({
        present: presentCount,
        absent: absentCount,
        percentage
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run on mount and when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboardData();
    });
    return unsubscribe;
  }, [navigation, account]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>My Attendance</Text>
          <Text style={styles.subtitle}>Welcome back, {account?.full_name}</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Days Present</Text>
            <Text style={[styles.statValue, { color: '#10b981' }]}>
              {loading ? '-' : stats.present}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Days Absent</Text>
            <Text style={[styles.statValue, { color: '#ef4444' }]}>
              {loading ? '-' : stats.absent}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Attendance %</Text>
            <Text style={[styles.statValue, { color: '#1f2937' }]}>
              {loading ? '-' : `${stats.percentage.toFixed(1)}%`}
            </Text>
          </View>
        </View>

        {/* Heatmap */}
        {loading ? (
          <ActivityIndicator size="large" color="#3b82f6" style={styles.loader} />
        ) : trackingStart ? (
          <AttendanceHeatmap
            logs={logs}
            trackingStartDate={trackingStart}
            endDate={endDate}
            cancelledDays={cancelledDays}
          />
        ) : null}

        {/* Recent History */}
        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Recent History</Text>
          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : logs.length === 0 ? (
            <Text style={styles.emptyText}>No attendance records found.</Text>
          ) : (
            logs.slice(0, 10).map((log, index) => {
              const d = new Date(log.verified_at);
              return (
                <View key={log.id || index} style={styles.historyRow}>
                  <View>
                    <Text style={styles.historyDate}>{d.toLocaleDateString()}</Text>
                    <Text style={styles.historyTime}>
                      {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.historyBadgeContainer}>
                    <Text style={styles.badgeNeutral}>{log.method}</Text>
                    <Text style={styles.badgeSuccess}>Present</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} /> 
      </ScrollView>

      {/* Floating Action Button for Check-in */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('CheckIn')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>Check In Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60, // Adjust for status bar if not using SafeAreaView
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  settingsButton: {
    padding: 8,
  },
  settingsButtonText: {
    fontSize: 24,
  },
  scrollContent: {
    padding: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#b91c1c',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  loader: {
    marginVertical: 20,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111827',
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  historyTime: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  historyBadgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  badgeNeutral: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  badgeSuccess: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
    overflow: 'hidden',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
