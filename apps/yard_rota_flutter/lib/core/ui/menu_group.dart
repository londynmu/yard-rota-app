import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';
import 'app_card.dart';

/// Uppercase caption above a [MenuGroup].
class MenuSectionLabel extends StatelessWidget {
  const MenuSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        AppSpacing.lg,
        AppSpacing.xs,
        AppSpacing.sm,
      ),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: context.appColors.textSecondary,
        ),
      ),
    );
  }
}

/// One card holding rows separated by thin dividers (Account menu style).
class MenuGroup extends StatelessWidget {
  const MenuGroup({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final divider = Divider(
      height: AppStroke.thin,
      thickness: AppStroke.thin,
      color: context.appColors.divider,
    );
    return AppCard(
      padding: EdgeInsets.zero,
      surfaceOpacity: AppOpacity.subtle,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) divider,
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

class MenuTile extends StatelessWidget {
  const MenuTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.isDestructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  /// `null` renders the row disabled.
  final VoidCallback? onTap;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(
          minHeight: AppComponentTokens.listItemMinHeight,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppComponentTokens.cardPadding,
            vertical: AppComponentTokens.listItemVerticalPadding,
          ),
          child: Row(
            children: [
              IconBadge(
                icon: icon,
                foreground: isDestructive ? colors.danger : null,
                background: isDestructive ? colors.dangerBg : null,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: textTheme.titleSmall?.copyWith(
                        color: isDestructive
                            ? colors.danger
                            : colors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      subtitle,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (!isDestructive)
                Icon(Icons.chevron_right_rounded, color: colors.textTertiary),
            ],
          ),
        ),
      ),
    );
  }
}

/// Round icon chip used at the start of menu rows and header cards. Defaults
/// to the primary tint.
class IconBadge extends StatelessWidget {
  const IconBadge({
    super.key,
    required this.icon,
    this.foreground,
    this.background,
  });

  final IconData icon;
  final Color? foreground;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      width: AppComponentTokens.buttonHeightSm,
      height: AppComponentTokens.buttonHeightSm,
      decoration: BoxDecoration(
        color:
            background ??
            colors.primary.withValues(alpha: AppOpacity.overlayLight / 2),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Icon(icon, color: foreground ?? colors.primary),
    );
  }
}

/// Borderless text input laid out like a [MenuTile], for use inside a
/// [MenuGroup]. Password fields get a show/hide toggle.
class MenuFieldRow extends StatefulWidget {
  const MenuFieldRow({
    super.key,
    required this.icon,
    required this.label,
    this.controller,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
  });

  final IconData icon;
  final String label;
  final TextEditingController? controller;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<MenuFieldRow> createState() => _MenuFieldRowState();
}

class _MenuFieldRowState extends State<MenuFieldRow> {
  late bool _hidden = widget.obscureText;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ConstrainedBox(
      constraints: const BoxConstraints(
        minHeight: AppComponentTokens.listItemMinHeight,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppComponentTokens.cardPadding,
          vertical: AppSpacing.xs,
        ),
        child: Row(
          children: [
            IconBadge(icon: widget.icon),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: TextField(
                controller: widget.controller,
                obscureText: _hidden,
                keyboardType: widget.keyboardType,
                textInputAction: widget.textInputAction,
                autofillHints: widget.autofillHints,
                autocorrect: !widget.obscureText,
                enableSuggestions: !widget.obscureText,
                onChanged: widget.onChanged,
                onSubmitted: widget.onSubmitted,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: colors.textPrimary),
                decoration: InputDecoration(
                  labelText: widget.label,
                  hintText: widget.hint,
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  errorBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                    vertical: AppSpacing.sm,
                  ),
                ),
              ),
            ),
            if (widget.obscureText)
              IconButton(
                tooltip: _hidden ? 'Show password' : 'Hide password',
                onPressed: () => setState(() => _hidden = !_hidden),
                icon: Icon(
                  _hidden
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: colors.textTertiary,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
