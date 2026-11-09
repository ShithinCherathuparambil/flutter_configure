part of 'task_bloc.dart';

abstract class TaskEvent {}

class LoadTasksEvent extends TaskEvent {}

class AddTaskEvent extends TaskEvent {
  final TaskEntity task;
  AddTaskEvent(this.task);
}

class UpdateTaskEvent extends TaskEvent {
  final TaskEntity task;
  UpdateTaskEvent(this.task);
}

class ToggleTaskStatusEvent extends TaskEvent {
  final TaskEntity task;
  ToggleTaskStatusEvent(this.task);
}

class DeleteTaskEvent extends TaskEvent {
  final String id;
  DeleteTaskEvent(this.id);
}

class FilterTasksEvent extends TaskEvent {
  final String? statusFilter;
  final String? priorityFilter;
  final String? searchQuery;

  FilterTasksEvent({
    this.statusFilter,
    this.priorityFilter,
    this.searchQuery,
  });
}
