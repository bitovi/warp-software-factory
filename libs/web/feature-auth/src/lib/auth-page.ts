import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LoginSchema,
  SignupSchema,
  ValidationErrorResponseSchema,
} from '@wsf/shared/schemas';
import { ApiRequestError } from '@wsf/web/core';
import { AccountCreatedError, AuthStore } from '@wsf/web/data-access-auth';
import { HlmButton, HlmInput } from '@wsf/web/ui';
import { z } from 'zod';
import { safeReturnUrl } from './auth-guards';

@Component({
  selector: 'wsf-auth-page',
  imports: [FormsModule, RouterLink, HlmButton, HlmInput],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly store = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly signup = this.route.snapshot.data['signup'] === true;
  protected readonly returnUrl = safeReturnUrl(
    this.route.snapshot.queryParamMap.get('returnUrl'),
  );
  protected readonly busy = computed(() =>
    ['authenticating', 'logging-out', 'initializing'].includes(
      this.store.status(),
    ),
  );
  protected readonly fieldErrors = signal<Record<string, string[]>>({});
  protected readonly message = signal('');
  protected readonly values: Record<string, string> = {
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    companyName: '',
  };
  protected readonly fields = [
    ...(this.signup
      ? [
          {
            name: 'firstName',
            label: 'First name',
            type: 'text',
            autocomplete: 'given-name',
            max: 100,
          },
          {
            name: 'lastName',
            label: 'Last name',
            type: 'text',
            autocomplete: 'family-name',
            max: 100,
          },
          {
            name: 'companyName',
            label: 'Company name',
            type: 'text',
            autocomplete: 'organization',
            max: 200,
          },
        ]
      : []),
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      autocomplete: 'email',
      max: 254,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      autocomplete: this.signup ? 'new-password' : 'current-password',
      max: 128,
    },
  ];

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.fieldErrors.set({});
    this.message.set('');
    const input = this.signup
      ? this.values
      : { email: this.values['email'], password: this.values['password'] };
    const signup = this.signup ? SignupSchema.safeParse(input) : null;
    const login = this.signup ? null : LoginSchema.safeParse(input);
    const validationError = signup?.error ?? login?.error;
    if (validationError) {
      this.fieldErrors.set(z.flattenError(validationError).fieldErrors);
      this.message.set('Check the highlighted fields.');
      return;
    }
    try {
      if (signup?.success) await this.store.signup(signup.data);
      else if (login?.success) await this.store.login(login.data);
      this.values['password'] = '';
      await this.router.navigateByUrl(this.returnUrl);
    } catch (error: unknown) {
      this.values['password'] = '';
      const response =
        error instanceof ApiRequestError ? error.response : error;
      if (response instanceof HttpErrorResponse && response.status === 400) {
        const validation = ValidationErrorResponseSchema.safeParse(
          response.error,
        );
        if (validation.success) {
          this.fieldErrors.set(validation.data.fieldErrors);
          this.message.set(
            validation.data.formErrors.join(' ') ||
              'Check the highlighted fields.',
          );
          return;
        }
      }
      this.message.set(
        error instanceof AccountCreatedError
          ? 'Your account was created, but sign-in did not finish. Sign in to continue.'
          : response instanceof HttpErrorResponse && response.status === 401
            ? 'Email or password is incorrect.'
            : response instanceof HttpErrorResponse && response.status === 409
              ? 'An account with this email already exists. Sign in to continue.'
              : 'Could not sign in. Check your connection and try again.',
      );
    }
  }
}
