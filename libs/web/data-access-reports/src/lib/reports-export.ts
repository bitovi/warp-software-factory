import {
  groupEntries,
  ReportFilters,
  summarize,
  TimeEntry,
} from './reports-model';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export interface ReportSnapshot {
  filters: ReportFilters;
  entries: TimeEntry[];
  financial: boolean;
}
export type ExportCell = string | number;

export function exportRows(snapshot: ReportSnapshot): ExportCell[][] {
  const { filters, entries, financial } = snapshot;
  const summary = summarize(entries, financial);
  const hours = (minutes: number) => Number((minutes / 60).toFixed(2));
  const headers = [
    'Type',
    'Group',
    'Date',
    'Project',
    'Client',
    'Person',
    'Description',
    'Status',
    'Billable',
    'Hours',
    ...(financial ? ['Amount (USD)'] : []),
  ];
  const row = (entry: TimeEntry, group: string): ExportCell[] => [
    'Entry',
    group,
    entry.date,
    entry.project,
    entry.client,
    entry.person,
    entry.description,
    entry.status,
    entry.billable ? 'Yes' : 'No',
    hours(entry.minutes),
    ...(financial ? [entry.amount ?? 0] : []),
  ];
  const total = (
    name: string,
    group: string,
    rows: TimeEntry[],
  ): ExportCell[] => {
    const summary = summarize(rows, financial);
    return [
      name,
      group,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      summary.hours,
      ...(financial ? [summary.amount ?? 0] : []),
    ];
  };
  const data: ExportCell[][] =
    filters.view === 'detailed'
      ? entries.map((entry) => row(entry, ''))
      : groupEntries(entries, filters.groupBy, financial).flatMap((group) => [
          ...group.entries.map((entry) => row(entry, group.name)),
          total('Subtotal', group.name, group.entries),
        ]);
  return [
    ['Time report - sample workspace'],
    ['Date range', filters.from, filters.to],
    ['Projects', filters.projects.join(', ') || 'All'],
    ['Clients', filters.clients.join(', ') || 'All'],
    ['People', filters.people.join(', ') || 'All'],
    ['Billable', filters.billable, 'Status', filters.status],
    [
      'View',
      filters.view,
      'Group by',
      filters.groupBy,
      'Chart split',
      filters.split,
    ],
    ['Currency', financial ? 'USD' : 'Financial data excluded'],
    ['Total hours', summary.hours, 'Billable hours', summary.billableHours],
    ['Billable percentage', Number(summary.billablePercent.toFixed(2))],
    ...(financial ? [['Billable amount (USD)', summary.amount ?? 0]] : []),
    [],
    headers,
    ...data,
    total('Total', '', entries),
  ];
}

export function spreadsheetText(value: string): string {
  // Spreadsheet applications can interpret formulas even after leading whitespace.
  let offset = 0;
  while (
    offset < value.length &&
    (value.charCodeAt(offset) <= 32 || /\s/.test(value.charAt(offset)))
  )
    offset++;
  return (offset < value.length && '=+-@'.includes(value.charAt(offset))) ||
    [9, 10, 13].includes(value.charCodeAt(0))
    ? `'${value}`
    : value;
}

export function csvContent(rows: ExportCell[][]): string {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text =
              typeof value === 'string'
                ? spreadsheetText(value)
                : String(value);
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}

export async function createExport(
  snapshot: ReportSnapshot,
  format: ExportFormat,
): Promise<Blob> {
  const rows = exportRows(snapshot);
  if (format === 'csv') {
    return new Blob([csvContent(rows)], { type: 'text/csv;charset=utf-8' });
  }
  if (format === 'xlsx') {
    const { default: writeXlsxFile } = await import(
      'write-excel-file/universal'
    );
    return writeXlsxFile(
      rows.map((row) =>
        row.map((value) =>
          typeof value === 'number'
            ? { type: Number, value }
            : { type: String, value: spreadsheetText(value) },
        ),
      ),
      {
        sheet: 'Time report',
        columns: Array.from({ length: 11 }, () => ({ width: 22 })),
      },
    ).toBlob();
  }
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
  pdf.setFont('helvetica');
  pdf.setFontSize(9);
  let y = 14;
  const pageHeight = pdf.internal.pageSize.getHeight();
  for (const row of rows) {
    const lines = pdf.splitTextToSize(row.join(' | '), 265) as string[];
    for (const line of lines) {
      if (y > pageHeight - 15) {
        pdf.addPage();
        y = 14;
      }
      pdf.text(line, 14, y);
      y += 5;
    }
    y += 2;
  }
  return pdf.output('blob');
}
