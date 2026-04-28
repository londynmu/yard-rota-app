import 'dart:async';

import 'package:flutter/material.dart';

import 'models.dart';
import 'network_policy.dart';

/// API abstraction for shunter-focused MVP flows.
///
/// Replace `MockApiClient` with a production implementation that maps to the
/// existing backend contracts once endpoint details are finalized.
abstract class ApiClient {
  Future<UserSession?> restoreSession();
  Future<UserSession> login({required String email, required String password});
  Future<void> signOut();
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  });
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  });
  Future<void> saveAvailability({required SaveAvailabilityRequest request});
}

class MockApiClient implements ApiClient {
  @override
  Future<UserSession?> restoreSession() async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return null;
  }

  @override
  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 260));
    if (email.isEmpty || password.isEmpty) {
      throw const UnauthorizedException('Email and password are required.');
    }
    if (password != 'yard123') {
      throw const UnauthorizedException('Invalid credentials.');
    }
    return const UserSession(userId: 'shunter-01', displayName: 'Shunter One');
  }

  @override
  Future<void> signOut() async {
    await Future<void>.delayed(const Duration(milliseconds: 80));
  }

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 320));
    if (month < 1 || month > 12) {
      throw const TransientNetworkException('Calendar month request failed.');
    }

    final daysInMonth = DateUtils.getDaysInMonth(year, month);
    final schedules = <CalendarDaySchedule>[];

    for (var day = 1; day <= daysInMonth; day += 1) {
      if (day % 3 == 0) {
        final date = DateTime(year, month, day);
        schedules.add(
          CalendarDaySchedule(
            date: date,
            shifts: [
              CalendarShift(
                title: day.isEven ? 'Day shift' : 'Night shift',
                startTime: day.isEven ? '06:00' : '22:00',
                endTime: day.isEven ? '14:00' : '06:00',
                location: day.isEven ? 'South Yard' : 'North Yard',
                status: day % 5 == 0 ? 'Delayed' : 'On time',
              ),
            ],
          ),
        );
      }
    }

    return CalendarMonthData(
      year: year,
      month: month,
      scheduledDays: schedules,
      fetchedAt: DateTime.now(),
    );
  }

  @override
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    return const [
      AvailabilityEntry(
        id: 'mock-availability-1',
        dateYmd: '2026-04-30',
        status: AvailabilityStatus.available,
      ),
    ];
  }

  @override
  Future<void> saveAvailability({
    required SaveAvailabilityRequest request,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 160));
    if (request.items.isEmpty) {
      throw const TransientNetworkException('No availability items provided.');
    }
  }
}
