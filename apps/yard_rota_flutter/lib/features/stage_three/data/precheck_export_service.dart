import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../domain/stage_three_models.dart';

class PreCheckExportService {
  const PreCheckExportService._();

  static Future<Uint8List> buildSingle(PreCheckSubmissionRecord submission) {
    return _build(
      title: 'PreCheck report',
      subtitle: '${submission.tugLabel} · ${submission.checkDate}',
      submissions: [submission],
    );
  }

  static Future<Uint8List> buildAuditPack({
    required String tugLabel,
    required String from,
    required String to,
    required List<PreCheckSubmissionRecord> submissions,
  }) {
    return _build(
      title: 'PreCheck audit pack',
      subtitle: '$tugLabel · $from to $to',
      submissions: submissions,
    );
  }

  static Future<void> printSingle(PreCheckSubmissionRecord submission) async {
    final bytes = await buildSingle(submission);
    await Printing.layoutPdf(onLayout: (_) async => bytes);
  }

  static Future<void> shareSingle(PreCheckSubmissionRecord submission) async {
    final bytes = await buildSingle(submission);
    await SharePlus.instance.share(
      ShareParams(
        text: 'PreCheck report for ${submission.tugLabel}',
        files: [
          XFile.fromData(
            bytes,
            mimeType: 'application/pdf',
            name:
                'precheck-${submission.tugNumber}-${submission.checkDate}.pdf',
          ),
        ],
      ),
    );
  }

  static Future<void> printAuditPack({
    required String tugLabel,
    required String from,
    required String to,
    required List<PreCheckSubmissionRecord> submissions,
  }) async {
    final bytes = await buildAuditPack(
      tugLabel: tugLabel,
      from: from,
      to: to,
      submissions: submissions,
    );
    await Printing.layoutPdf(onLayout: (_) async => bytes);
  }

  static Future<Uint8List> _build({
    required String title,
    required String subtitle,
    required List<PreCheckSubmissionRecord> submissions,
  }) async {
    final document = pw.Document();
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        header: (_) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Text(
              title,
              style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold),
            ),
            pw.Text(subtitle, style: const pw.TextStyle(fontSize: 10)),
            pw.SizedBox(height: 10),
          ],
        ),
        build: (_) => [
          for (final submission in submissions) ...[
            pw.Container(
              padding: const pw.EdgeInsets.all(10),
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: PdfColors.grey400),
                borderRadius: pw.BorderRadius.circular(6),
              ),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    '${submission.tugLabel} (${submission.tugNumber})',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  ),
                  pw.Text(
                    '${submission.checkDate} · ${_time(submission.checkTime)} · '
                    '${submission.userName} · ${_type(submission.checkType)}',
                  ),
                  if (submission.locationName?.isNotEmpty == true)
                    pw.Text('Location: ${submission.locationName}'),
                  pw.SizedBox(height: 8),
                  pw.Text(
                    'Check items',
                    style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                  ),
                  for (final item in submission.items)
                    pw.Bullet(
                      text:
                          '${item.name}: ${item.status.toUpperCase()}'
                          '${item.notes?.isNotEmpty == true ? ' — ${item.notes}' : ''}',
                    ),
                  if (submission.defects.isNotEmpty) ...[
                    pw.SizedBox(height: 8),
                    pw.Text(
                      'Faults',
                      style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                    ),
                    for (final defect in submission.defects)
                      pw.Bullet(
                        text:
                            '${defect.itemLabel ?? 'Damage'}: ${defect.description} '
                            '[${defect.status.label}]'
                            '${defect.defectNumber?.isNotEmpty == true ? ' · ${defect.defectNumber}' : ''}',
                      ),
                  ],
                  if (submission.remarks?.isNotEmpty == true) ...[
                    pw.SizedBox(height: 8),
                    pw.Text(
                      'Remarks',
                      style: pw.TextStyle(fontWeight: pw.FontWeight.bold),
                    ),
                    pw.Text(submission.remarks!),
                  ],
                ],
              ),
            ),
            pw.SizedBox(height: 12),
          ],
        ],
      ),
    );
    return document.save();
  }

  static String _type(String value) =>
      value == 'pre_shift' ? 'Pre-Shift' : 'During Shift';
  static String _time(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
