import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AuthMeResponseSchema,
  LoginSchema,
  SignupResponseSchema,
  SignupSchema,
  TokenResponseSchema,
  type Login,
  type Signup,
} from '@wsf/shared/schemas';
import { firstValueFrom, map, timeout } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthClient {
  private readonly http = inject(HttpClient);
  private readonly cookieOptions = {
    withCredentials: true,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  };

  signup(input: Signup) {
    return firstValueFrom(
      this.http
        .post<unknown>('/api/auth/signup', SignupSchema.parse(input))
        .pipe(
          timeout(10000),
          map((response) => SignupResponseSchema.parse(response)),
        ),
    );
  }

  login(input: Login) {
    return firstValueFrom(
      this.http
        .post<unknown>(
          '/api/auth/login',
          LoginSchema.parse(input),
          this.cookieOptions,
        )
        .pipe(
          timeout(10000),
          map((response) => TokenResponseSchema.parse(response)),
        ),
    );
  }

  refresh() {
    return firstValueFrom(
      this.http.post<unknown>('/api/auth/refresh', {}, this.cookieOptions).pipe(
        timeout(10000),
        map((response) => TokenResponseSchema.parse(response)),
      ),
    );
  }

  me() {
    return firstValueFrom(
      this.http.get<unknown>('/api/auth/me').pipe(
        timeout(10000),
        map((response) => AuthMeResponseSchema.parse(response)),
      ),
    );
  }

  logout() {
    return firstValueFrom(
      this.http
        .post<void>('/api/auth/logout', {}, this.cookieOptions)
        .pipe(timeout(10000)),
    );
  }
}
