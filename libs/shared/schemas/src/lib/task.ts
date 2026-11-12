import { z } from 'zod';
import { QuerySchema } from './query';

const TaskFieldsSchema = z.strictObject({
  title: z.string().trim().min(1, 'Enter a task title.').max(120),
  completed: z.boolean(),
});

export const CreateTaskSchema = TaskFieldsSchema.extend({
  completed: TaskFieldsSchema.shape.completed.default(false),
});

export const UpdateTaskSchema = TaskFieldsSchema.partial().refine(
  (task) => Object.keys(task).length > 0,
  'Provide at least one task field.',
);

export const TaskResponseSchema = TaskFieldsSchema.extend({
  id: z.uuid(),
});

export const TaskQuerySchema = QuerySchema;

export const TaskListResponseSchema = z.strictObject({
  items: z.array(TaskResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type TaskResponse = z.infer<typeof TaskResponseSchema>;
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
