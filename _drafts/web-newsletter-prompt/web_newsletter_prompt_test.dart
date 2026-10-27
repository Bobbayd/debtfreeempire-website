import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:paper_and_prosperity/features/dashboard/web_newsletter_prompt.dart';

Widget host() => const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: WebNewsletterPrompt())));

void main() {
  testWidgets('shows once on the first visit, can be dismissed, never shows again', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
    expect(find.text('Want free budgeting tips?'), findsOneWidget, reason: 'first visit shows the card');
    expect(find.text('Join the newsletter'), findsOneWidget);

    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pumpAndSettle();
    expect(find.text('Want free budgeting tips?'), findsNothing, reason: 'dismiss hides it');

    // A later visit (new widget, same stored preferences) shows nothing.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
    expect(find.text('Want free budgeting tips?'), findsNothing, reason: 'only the first visit');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('web_newsletter_prompt_seen_v1'), true);
  });

  testWidgets('stays hidden for someone who already saw it', (tester) async {
    SharedPreferences.setMockInitialValues({'web_newsletter_prompt_seen_v1': true});
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
    expect(find.text('Want free budgeting tips?'), findsNothing);
  });
}
