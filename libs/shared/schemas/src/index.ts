import { z } from 'zod';

export const workspaceStatusSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;

export const workspaceHealthSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up').optional(),
});

export type WorkspaceHealth = z.infer<typeof workspaceHealthSchema>;

export * from './lib/query';
export * from './lib/auth';
export * from './lib/signup';
export * from './lib/task';
export * from './lib/validation-error';
