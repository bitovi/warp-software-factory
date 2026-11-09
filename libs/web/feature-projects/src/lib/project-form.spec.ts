import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoProjects } from '@wsf/web/data-access-projects';
import { createProjectForm } from './project-form';

test('new project form validates required fields, date order and numeric limits', () => {
  const form = createProjectForm();
  assert.equal(form.valid, false);
  form.patchValue({ name: 'Customer portal', code: 'new-006' });
  assert.equal(form.valid, true);
  assert.equal(form.getRawValue().budget, null);
  form.patchValue({ startDate: '2026-11-10', endDate: '2026-11-09' });
  assert.equal(form.hasError('dateOrder'), true);
  form.patchValue({ endDate: '2026-11-10' });
  assert.equal(form.valid, true);
  form.patchValue({ rate: -1, budget: 0 });
  assert.equal(form.controls.rate.invalid, true);
  assert.equal(form.controls.budget.invalid, true);
  form.patchValue({ rate: 0, budget: null, name: ' ' });
  assert.equal(form.controls.name.invalid, true);
  form.patchValue({ name: 'Customer portal', code: 'bad code' });
  assert.equal(form.controls.code.invalid, true);
});

test('edit form retains every editable value, including non-billable zero rate and an optional client', () => {
  const project = createDemoProjects().find((item) => item.id === 'internal')!;
  const form = createProjectForm(project);
  assert.deepEqual(form.getRawValue(), {
    name: project.name,
    code: project.code,
    clientId: '',
    startDate: project.startDate,
    endDate: project.endDate,
    color: project.color,
    billable: false,
    rate: 0,
    budget: null,
  });
  assert.equal(form.valid, true);
  form.patchValue({ budget: 40, clientId: 'acme', billable: true, rate: 140 });
  assert.equal(form.valid, true);
  assert.equal(project.billable, false);
});
