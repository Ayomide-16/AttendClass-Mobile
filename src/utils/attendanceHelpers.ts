export function getWorkingDays(startDateStr: string, endDateStr: string): string[] {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  // Normalize to UTC midnight to avoid local timezone shifts during iteration
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  const days: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getUTCDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split("T")[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

export function isCountableDay(dateStr: string, trackingStartStr: string, cancelledDatesSet: Set<string>): boolean {
  if (cancelledDatesSet.has(dateStr)) return false;
  if (dateStr < trackingStartStr) return false;
  return true;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  totalCountable: number;
  percentage: number;
}

export function calculateAttendanceStats(
  userTrackingStart: string,
  workingDays: string[],
  cancelledDatesSet: Set<string>,
  userPresentDatesSet: Set<string>
): AttendanceStats {
  let present = 0;
  let absent = 0;

  for (const day of workingDays) {
    if (!isCountableDay(day, userTrackingStart, cancelledDatesSet)) {
      continue;
    }

    if (userPresentDatesSet.has(day)) {
      present++;
    } else {
      absent++;
    }
  }

  const totalCountable = present + absent;
  const percentage = totalCountable > 0 ? (present / totalCountable) * 100 : 0;

  return {
    present,
    absent,
    totalCountable,
    percentage,
  };
}
