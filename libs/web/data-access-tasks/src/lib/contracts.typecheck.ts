import type {
  CreateTask,
  TaskListResponse,
  TaskQuery,
  TaskResponse,
  UpdateTask,
} from '@wsf/shared/schemas';
import type { Observable } from 'rxjs';
import type { TasksClient } from './tasks-client';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

export type WebContractAssertions = [
  Assert<Equal<Parameters<TasksClient['create']>[0], CreateTask>>,
  Assert<Equal<ReturnType<TasksClient['create']>, Observable<TaskResponse>>>,
  Assert<Equal<Parameters<TasksClient['update']>[1], UpdateTask>>,
  Assert<Equal<ReturnType<TasksClient['update']>, Observable<TaskResponse>>>,
  Assert<Equal<Parameters<TasksClient['list']>[0], TaskQuery>>,
  Assert<Equal<ReturnType<TasksClient['list']>, Observable<TaskListResponse>>>,
];
