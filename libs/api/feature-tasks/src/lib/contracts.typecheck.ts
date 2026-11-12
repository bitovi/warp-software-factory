import type {
  CreateTask,
  TaskListResponse,
  TaskQuery,
  TaskResponse,
  UpdateTask,
} from '@wsf/shared/schemas';
import type { TasksController } from './tasks.controller';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

export type ApiContractAssertions = [
  Assert<Equal<Parameters<TasksController['create']>[0], CreateTask>>,
  Assert<Equal<ReturnType<TasksController['create']>, TaskResponse>>,
  Assert<Equal<Parameters<TasksController['update']>[1], UpdateTask>>,
  Assert<Equal<ReturnType<TasksController['update']>, TaskResponse>>,
  Assert<Equal<Parameters<TasksController['list']>[0], TaskQuery>>,
  Assert<Equal<ReturnType<TasksController['list']>, TaskListResponse>>,
];

export const createExample = {
  title: 'Ship contracts',
  completed: false,
} satisfies Parameters<TasksController['create']>[0];
