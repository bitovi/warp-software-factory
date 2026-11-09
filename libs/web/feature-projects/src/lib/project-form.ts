import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  NamedOption,
  Project,
  ProjectInput,
} from '@wsf/web/data-access-projects';
import { HlmButton } from '@wsf/web/ui';

export function createProjectForm(project?: Project | null) {
  return new FormGroup(
    {
      name: new FormControl(project?.name ?? '', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(100),
          Validators.pattern(/\S/),
        ],
      }),
      code: new FormControl(project?.code ?? '', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]{1,11}$/),
        ],
      }),
      clientId: new FormControl(project?.clientId ?? '', { nonNullable: true }),
      startDate: new FormControl(project?.startDate ?? '', {
        nonNullable: true,
      }),
      endDate: new FormControl(project?.endDate ?? '', { nonNullable: true }),
      color: new FormControl(project?.color ?? '#0d9488', {
        nonNullable: true,
      }),
      billable: new FormControl(project?.billable ?? true, {
        nonNullable: true,
      }),
      rate: new FormControl(project?.rate ?? 125, {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.min(0),
          Validators.max(1_000_000),
        ],
      }),
      budget: new FormControl<number | null>(project?.budget ?? null, {
        validators: [Validators.min(0.01), Validators.max(1_000_000)],
      }),
    },
    {
      validators: (group) => {
        const { startDate, endDate } = group.value;
        return startDate && endDate && endDate < startDate
          ? { dateOrder: true }
          : null;
      },
    },
  );
}

@Component({
  selector: 'wsf-project-form',
  imports: [ReactiveFormsModule, HlmButton],
  templateUrl: './project-form.html',
  styleUrl: './project-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectForm implements OnInit, AfterViewInit {
  readonly project = input<Project | null>(null);
  readonly clients = input.required<readonly NamedOption[]>();
  readonly error = input('');
  readonly saved = output<ProjectInput>();
  readonly dismissed = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  form = createProjectForm();

  ngOnInit(): void {
    this.form = createProjectForm(this.project());
  }

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.dialog()
        .nativeElement.querySelector<HTMLElement>('.ng-invalid:not(form)')
        ?.focus();
      return;
    }
    this.saved.emit(this.form.getRawValue());
  }
}
