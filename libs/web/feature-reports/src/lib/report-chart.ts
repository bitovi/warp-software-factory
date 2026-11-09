import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  ArcElement,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  ArcElement,
  LinearScale,
  Tooltip,
);

@Component({
  selector: 'wsf-report-chart',
  template:
    '<canvas #canvas role="img" [attr.aria-label]="description()"></canvas>',
  styles: ':host { display: block; height: 190px; min-width: 0; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportChart implements AfterViewInit, OnDestroy {
  readonly points = input.required<{ label: string; hours: number }[]>();
  readonly kind = input<'bar' | 'doughnut'>('bar');
  readonly description = input.required<string>();
  private readonly canvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const points = this.points();
      if (this.chart) {
        this.chart.data.labels = points.map((point) =>
          this.kind() === 'doughnut'
            ? point.label
            : point.label.slice(5).replace('-', '/'),
        );
        const dataset = this.chart.data.datasets[0];
        if (dataset) dataset.data = points.map((point) => point.hours);
        this.chart.update();
      }
    });
  }

  ngAfterViewInit(): void {
    const donut = this.kind() === 'doughnut';
    this.chart = new Chart(this.canvas().nativeElement, {
      type: this.kind(),
      data: {
        labels: this.points().map((point) =>
          donut ? point.label : point.label.slice(5).replace('-', '/'),
        ),
        datasets: [
          {
            label: 'Hours',
            data: this.points().map((point) => point.hours),
            backgroundColor: donut
              ? ['#7361d8', '#37a7a0', '#e6ac57', '#a5a9bd', '#d684a1']
              : '#8c7be6',
            borderWidth: 0,
            borderRadius: donut ? 0 : 5,
            maxBarThickness: 34,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        ...(donut
          ? { cutout: '76%' }
          : {
              scales: {
                x: { grid: { display: false }, ticks: { color: '#727887' } },
                y: {
                  beginAtZero: true,
                  grid: { color: '#eff0f4' },
                  ticks: { color: '#727887' },
                },
              },
            }),
      },
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
