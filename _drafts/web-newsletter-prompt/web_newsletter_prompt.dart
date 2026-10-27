import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_colors.dart';
import '../../shared/widgets/soft_card.dart';

/// A soft, dismissible card shown once, on a visitor's first look at the
/// dashboard in the web app. It only links out to the website's newsletter
/// signup, so the app itself never asks for or stores an email address. On
/// phones, tablets and desktop builds it shows nothing.
class WebNewsletterPrompt extends StatefulWidget {
  const WebNewsletterPrompt({super.key});

  @override
  State<WebNewsletterPrompt> createState() => _WebNewsletterPromptState();
}

class _WebNewsletterPromptState extends State<WebNewsletterPrompt> {
  static const _seenKey = 'web_newsletter_prompt_seen_v1';
  static final _signupUrl = Uri.parse('https://www.debtfreeempire.com/#newsletter');

  bool _visible = false;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) _showOnFirstVisit();
  }

  Future<void> _showOnFirstVisit() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_seenKey) ?? false) return;
    // Marked as seen right away, so it only ever appears on the first visit.
    await prefs.setBool(_seenKey, true);
    if (mounted) setState(() => _visible = true);
  }

  Future<void> _join() async {
    await launchUrl(_signupUrl, mode: LaunchMode.externalApplication);
    if (mounted) setState(() => _visible = false);
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: SoftCard(
        color: AppColors.lavender.withValues(alpha: 0.16),
        padding: const EdgeInsets.fromLTRB(18, 12, 6, 12),
        child: Row(
          children: [
            const Text('✉️', style: TextStyle(fontSize: 20)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Want free budgeting tips?', style: text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    'Join the Debt Free Empire newsletter: practical tips and free printables, no pressure.',
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: _join,
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                      child: const Text('Join the newsletter'),
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Dismiss',
              icon: const Icon(Icons.close_rounded, size: 20),
              onPressed: () => setState(() => _visible = false),
            ),
          ],
        ),
      ),
    );
  }
}
