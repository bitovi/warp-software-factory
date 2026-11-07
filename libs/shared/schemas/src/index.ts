import { z } from 'zod';

export const workspaceStatusSchema = z.strictObject({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
