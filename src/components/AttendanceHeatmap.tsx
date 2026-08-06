import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';

interface Log {
  verified_at: string;
}

interface AttendanceHeatmapProps {
  logs: Log[];
  trackingStartDate: string;
  endDate: Date;
  cancelledDays: Set<string>;
}

export function AttendanceHeatmap({ logs, trackingStartDate, endDate, cancelledDays }: AttendanceHeatmapProps) {
  const [activeTooltip, setActiveTooltip] = useState<{ date: string; status: string } | null>(null);

  const startObj = new Date(trackingStartDate);
  startObj.setDate(1);

  // Generate months from tracking start date to end date
  const months: Date[] = [];
  const currentMonth = new Date(startObj);
  while (
    currentMonth.getFullYear() < endDate.getFullYear() ||
    (currentMonth.getFullYear() === endDate.getFullYear() && currentMonth.getMonth() <= endDate.getMonth())
  ) {
    months.push(new Date(currentMonth));
    currentMonth.setMonth(currentMonth.getMonth() + 1);
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {months.map((monthDate, idx) => {
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();

          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDayOfWeek = new Date(year, month, 1).getDay();

          const days: (string | null)[] = Array(firstDayOfWeek).fill(null);
          for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = [
              year,
              String(month + 1).padStart(2, "0"),
              String(i).padStart(2, "0"),
            ].join("-");
            days.push(dateStr);
          }

          return (
            <View key={idx} style={styles.monthContainer}>
              <Text style={styles.monthLabel}>
                {monthDate.toLocaleString("default", { month: "short", year: "numeric" })}
              </Text>
              
              <View style={styles.grid}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <Text key={`header-${i}`} style={styles.dayHeader}>{d}</Text>
                ))}
                
                {days.map((dateStr, i) => {
                  if (!dateStr) return <View key={`empty-${i}`} style={styles.cell} />;

                  const isPreStart = dateStr < trackingStartDate;
                  const isCancelled = cancelledDays.has(dateStr);
                  const isPresent = logs.some((l) => l.verified_at.startsWith(dateStr));
                  const dObj = new Date(dateStr);
                  const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
                  const isFuture = dateStr > todayStr;

                  let color = "#f9fafb"; // var(--color-bg) equivalent, light grey
                  let status = "Not yet tracked";
                  let isDashed = false;

                  if (isPreStart) {
                    color = "#e5e7eb"; // border
                    status = "Not yet tracked";
                  } else if (isCancelled) {
                    color = "#9ca3af"; // text-muted
                    status = "Holiday";
                  } else if (isWeekend) {
                    color = "#e5e7eb"; // border
                    status = "Weekend";
                  } else if (isPresent) {
                    color = "#10b981"; // success green
                    status = "Present";
                  } else if (!isFuture) {
                    color = "#ef4444"; // error red
                    status = "Absent";
                  } else {
                    color = "#f9fafb"; // future
                    status = "Future";
                    isDashed = true;
                  }

                  return (
                    <Pressable
                      key={dateStr}
                      style={[
                        styles.cell,
                        { backgroundColor: color },
                        isDashed && styles.cellDashed,
                        activeTooltip?.date === dateStr && styles.cellActive
                      ]}
                      onPress={() => setActiveTooltip({ date: dateStr, status })}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Tooltip & Legend Area */}
      <View style={styles.footerContainer}>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#10b981" }]} />
            <Text style={styles.legendText}>Present</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#ef4444" }]} />
            <Text style={styles.legendText}>Absent</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: "#9ca3af" }]} />
            <Text style={styles.legendText}>Holiday</Text>
          </View>
        </View>

        <View style={styles.tooltipContainer}>
          <Text style={styles.tooltipText}>
            {activeTooltip ? `${activeTooltip.date}: ${activeTooltip.status}` : "Tap a cell for details"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111827',
  },
  scrollContent: {
    paddingBottom: 8,
  },
  monthContainer: {
    marginRight: 20,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    color: '#374151',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 7 * 20, // 7 columns * (16 width + 4 gap)
  },
  dayHeader: {
    width: 16,
    fontSize: 10,
    textAlign: 'center',
    color: '#6b7280',
    marginRight: 4,
    marginBottom: 4,
  },
  cell: {
    width: 16,
    height: 16,
    borderRadius: 2,
    marginRight: 4,
    marginBottom: 4,
  },
  cellDashed: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  cellActive: {
    borderWidth: 2,
    borderColor: '#3b82f6', // blue highlight for tapped cell
  },
  footerContainer: {
    marginTop: 12,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#4b5563',
  },
  tooltipContainer: {
    minHeight: 20,
  },
  tooltipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  }
});
