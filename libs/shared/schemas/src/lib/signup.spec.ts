import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SignupSchema } from './signup';

const input = {
  email: ' Owner@Example.com ',
  password: '  long passphrase  ',
  firstName: ' Ada ',
  lastName: ' Lovelace ',
  companyName: ' Analytical Engines ',
};

describe('signup contract', () => {
  it('normalizes identity fields without changing the password', () => {
    assert.deepEqual(SignupSchema.parse(input), {
      email: 'owner@example.com',
      password: input.password,
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: 'Analytical Engines',
    });
    for (const length of [12, 128]) {
      assert.equal(
        SignupSchema.parse({ ...input, password: 'a'.repeat(length) }).password
          .length,
        length,
      );
    }
  });

  it('rejects invalid fields and unknown privilege fields', () => {
    for (const [field, value] of [
      ['email', 'invalid'],
      ['email', `${'a'.repeat(250)}@example.com`],
      ['password', 'a'.repeat(11)],
      ['password', 'a'.repeat(129)],
      ['firstName', ' '],
      ['lastName', 'a'.repeat(101)],
      ['companyName', 'a'.repeat(201)],
    ] as const) {
      const result = SignupSchema.safeParse({ ...input, [field]: value });
      assert.equal(result.success, false, field);
      if (!result.success) {
        assert.equal(result.error.issues[0]?.path[0], field);
      }
    }
    assert.equal(
      SignupSchema.safeParse({ ...input, isOwner: false }).success,
      false,
    );
  });
});
