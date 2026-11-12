import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ZodValidationPipe } from '@wsf/api/core';
import {
  CreateTaskSchema,
  TaskListResponseSchema,
  TaskQuerySchema,
  TaskResponseSchema,
  UpdateTaskSchema,
  type CreateTask,
  type TaskListResponse,
  type TaskQuery,
  type TaskResponse,
  type UpdateTask,
} from '@wsf/shared/schemas';

@Controller('tasks')
export class TasksController {
  private readonly tasks = new Map<string, TaskResponse>();

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateTaskSchema)) input: CreateTask,
  ): TaskResponse {
    const task = TaskResponseSchema.parse({ ...input, id: randomUUID() });
    this.tasks.set(task.id, task);
    return task;
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTaskSchema)) input: UpdateTask,
  ): TaskResponse {
    const task = this.tasks.get(id);
    if (!task) throw new NotFoundException('Task not found');
    const updated = TaskResponseSchema.parse({ ...task, ...input });
    this.tasks.set(id, updated);
    return updated;
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(TaskQuerySchema)) query: TaskQuery,
  ): TaskListResponse {
    const matches = [...this.tasks.values()]
      .filter((task) =>
        task.title.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort((left, right) => {
        const order = left.title.localeCompare(right.title);
        return query.sort === 'asc' ? order : -order;
      });
    const offset = (query.page - 1) * query.pageSize;
    return TaskListResponseSchema.parse({
      items: matches.slice(offset, offset + query.pageSize),
      total: matches.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
