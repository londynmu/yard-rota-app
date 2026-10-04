import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/config/app_links.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String? _version;

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform()
        .then((info) {
          if (mounted) {
            setState(() => _version = '${info.version} (${info.buildNumber})');
          }
        })
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Scaffold(
      appBar: AppBar(title: const Text('About & privacy')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Yard Rota',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    _version == null ? 'Version' : 'Version $_version',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Column(
                children: [
                  _LinkTile(
                    icon: Icons.privacy_tip_outlined,
                    title: 'Privacy Policy',
                    onTap: () => openAppLink(context, AppLinks.privacyPolicy),
                  ),
                  _LinkTile(
                    icon: Icons.description_outlined,
                    title: 'Terms of Use',
                    onTap: () => openAppLink(context, AppLinks.termsOfUse),
                  ),
                  _LinkTile(
                    icon: Icons.person_remove_outlined,
                    title: 'Account deletion',
                    onTap: () => openAppLink(context, AppLinks.accountDeletion),
                  ),
                  _LinkTile(
                    icon: Icons.mail_outline,
                    title: 'Contact support',
                    subtitle: AppLinks.supportEmail,
                    onTap: () => openAppLink(context, AppLinks.support),
                  ),
                  _LinkTile(
                    icon: Icons.article_outlined,
                    title: 'Open-source licences',
                    onTap: () => showLicensePage(
                      context: context,
                      applicationName: 'Yard Rota',
                      applicationVersion: _version,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: context.appColors.textSecondary),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
