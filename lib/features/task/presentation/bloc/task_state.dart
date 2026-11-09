part of 'task_bloc.dart';

abstract class TaskState {}

class TaskInitial extends TaskState {}

class TaskLoading extends TaskState {}

class TaskLoaded extends TaskState {
  final List<TaskEntity> allTasks;
  final List<TaskEntity> filteredTasks;
  final String statusFilter;
  final String priorityFilter;
  final String searchQuery;

  TaskLoaded({
    required this.allTasks,
    required this.filteredTasks,
    this.statusFilter = 'All',
    this.priorityFilter = 'All',
    this.searchQuery = '',
  });

  TaskLoaded copyWith({
    List<TaskEntity>? allTasks,
    List<TaskEntity>? filteredTasks,
    String? statusFilter,
    String? priorityFilter,
    String? searchQuery,
  }) {
    return TaskLoaded(
      allTasks: allTasks ?? this.allTasks,
      filteredTasks: filteredTasks ?? this.filteredTasks,
      statusFilter: statusFilter ?? this.statusFilter,
      priorityFilter: priorityFilter ?? this.priorityFilter,
      searchQuery: searchQuery ?? this.searchQuery,
    );
  }
}

class TaskError extends TaskState {
  final String message;
  TaskError(this.message);
}
