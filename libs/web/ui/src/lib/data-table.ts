import {
  ChangeDetectionStrategy,
  Component,
  Input,
  type TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

export interface TableColumn {
  readonly key: string;
  readonly label: string;
}

@Component({
  selector: 'wsf-data-table',
  imports: [NgTemplateOutlet],
  template: `
    <div class="overflow-x-auto rounded-xl border border-border bg-white">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          {{
            caption
          }}
        </caption>
        <thead class="border-b border-border bg-slate-50 text-slate-600">
          <tr>
            @for (column of columns; track column.key) {
              <th scope="col" class="px-5 py-3.5 font-medium">
                {{ column.label }}
              </th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (row of rows; track row.id) {
            <tr class="transition-colors hover:bg-slate-50/70">
              @for (column of columns; track column.key) {
                <td class="px-5 py-4">
                  <ng-container
                    [ngTemplateOutlet]="cellTemplate"
                    [ngTemplateOutletContext]="{
                      $implicit: row,
                      column: column.key,
                    }"
                  />
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td
                [attr.colspan]="columns.length"
                class="px-6 py-14 text-center text-slate-500"
              >
                {{ emptyMessage }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTable<T extends { readonly id: string }> {
  @Input({ required: true }) caption = '';
  @Input({ required: true }) columns: readonly TableColumn[] = [];
  @Input({ required: true }) rows: readonly T[] = [];
  @Input({ required: true }) cellTemplate!: TemplateRef<{
    $implicit: T;
    column: string;
  }>;
  @Input() emptyMessage = 'No records found.';
}
