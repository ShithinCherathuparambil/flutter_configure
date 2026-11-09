import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:injectable/injectable.dart';
import '../../domain/entities/task_entity.dart';
import '../../domain/usecases/get_task_usecase.dart';
import '../../domain/usecases/create_task_usecase.dart';
import '../../domain/usecases/update_task_usecase.dart';
import '../../domain/usecases/patch_task_usecase.dart';
import '../../domain/usecases/delete_task_usecase.dart';

part 'task_event.dart';
part 'task_state.dart';

@injectable
class TaskBloc extends Bloc<TaskEvent, TaskState> {
  final GetTaskUseCase getTaskUseCase;
  final CreateTaskUseCase createTaskUseCase;
  final UpdateTaskUseCase updateTaskUseCase;
  final PatchTaskUseCase patchTaskUseCase;
  final DeleteTaskUseCase deleteTaskUseCase;

  TaskBloc({
    required this.getTaskUseCase,
    required this.createTaskUseCase,
    required this.updateTaskUseCase,
    required this.patchTaskUseCase,
    required this.deleteTaskUseCase,
  }) : super(TaskInitial()) {
    on<LoadTasksEvent>(_onLoadTasks);
    on<AddTaskEvent>(_onAddTask);
    on<UpdateTaskEvent>(_onUpdateTask);
    on<ToggleTaskStatusEvent>(_onToggleTaskStatus);
    on<DeleteTaskEvent>(_onDeleteTask);
    on<FilterTasksEvent>(_onFilterTasks);
  }

  List<TaskEntity> _applyFilters(
    List<TaskEntity> tasks, {
    required String status,
    required String priority,
    required String query,
  }) {
    return tasks.where((task) {
      if (status != 'All' && task.status.toLowerCase() != status.toLowerCase()) {
        return false;
      }
      if (priority != 'All' && task.priority.toLowerCase() != priority.toLowerCase()) {
        return false;
      }
      if (query.isNotEmpty) {
        final q = query.toLowerCase();
        final matchTitle = task.task_title.toLowerCase().contains(q);
        final matchDesc = task.description.toLowerCase().contains(q);
        if (!matchTitle && !matchDesc) return false;
      }
      return true;
    }).toList();
  }

  Future<void> _onLoadTasks(LoadTasksEvent event, Emitter<TaskState> emit) async {
    emit(TaskLoading());
    try {
      final tasks = await getTaskUseCase.execute();
      final currentStatus = state is TaskLoaded ? (state as TaskLoaded).statusFilter : 'All';
      final currentPriority = state is TaskLoaded ? (state as TaskLoaded).priorityFilter : 'All';
      final currentQuery = state is TaskLoaded ? (state as TaskLoaded).searchQuery : '';

      final filtered = _applyFilters(
        tasks,
        status: currentStatus,
        priority: currentPriority,
        query: currentQuery,
      );
      emit(TaskLoaded(
        allTasks: tasks,
        filteredTasks: filtered,
        statusFilter: currentStatus,
        priorityFilter: currentPriority,
        searchQuery: currentQuery,
      ));
    } catch (e) {
      emit(TaskError(e.toString()));
    }
  }

  Future<void> _onAddTask(AddTaskEvent event, Emitter<TaskState> emit) async {
    try {
      await createTaskUseCase.execute(event.task);
      final tasks = await getTaskUseCase.execute();
      final currentStatus = state is TaskLoaded ? (state as TaskLoaded).statusFilter : 'All';
      final currentPriority = state is TaskLoaded ? (state as TaskLoaded).priorityFilter : 'All';
      final currentQuery = state is TaskLoaded ? (state as TaskLoaded).searchQuery : '';

      emit(TaskLoaded(
        allTasks: tasks,
        filteredTasks: _applyFilters(
          tasks,
          status: currentStatus,
          priority: currentPriority,
          query: currentQuery,
        ),
        statusFilter: currentStatus,
        priorityFilter: currentPriority,
        searchQuery: currentQuery,
      ));
    } catch (e) {
      emit(TaskError('Failed to add task: ${e.toString()}'));
    }
  }

  Future<void> _onUpdateTask(UpdateTaskEvent event, Emitter<TaskState> emit) async {
    try {
      await updateTaskUseCase.execute(event.task);
      final tasks = await getTaskUseCase.execute();
      final currentStatus = state is TaskLoaded ? (state as TaskLoaded).statusFilter : 'All';
      final currentPriority = state is TaskLoaded ? (state as TaskLoaded).priorityFilter : 'All';
      final currentQuery = state is TaskLoaded ? (state as TaskLoaded).searchQuery : '';

      emit(TaskLoaded(
        allTasks: tasks,
        filteredTasks: _applyFilters(
          tasks,
          status: currentStatus,
          priority: currentPriority,
          query: currentQuery,
        ),
        statusFilter: currentStatus,
        priorityFilter: currentPriority,
        searchQuery: currentQuery,
      ));
    } catch (e) {
      emit(TaskError('Failed to update task: ${e.toString()}'));
    }
  }

  Future<void> _onToggleTaskStatus(ToggleTaskStatusEvent event, Emitter<TaskState> emit) async {
    try {
      final newStatus = event.task.isCompleted ? 'Pending' : 'Completed';
      final updated = event.task.copyWith(status: newStatus);
      await updateTaskUseCase.execute(updated);
      final tasks = await getTaskUseCase.execute();
      final currentStatus = state is TaskLoaded ? (state as TaskLoaded).statusFilter : 'All';
      final currentPriority = state is TaskLoaded ? (state as TaskLoaded).priorityFilter : 'All';
      final currentQuery = state is TaskLoaded ? (state as TaskLoaded).searchQuery : '';

      emit(TaskLoaded(
        allTasks: tasks,
        filteredTasks: _applyFilters(
          tasks,
          status: currentStatus,
          priority: currentPriority,
          query: currentQuery,
        ),
        statusFilter: currentStatus,
        priorityFilter: currentPriority,
        searchQuery: currentQuery,
      ));
    } catch (e) {
      emit(TaskError('Failed to toggle status: ${e.toString()}'));
    }
  }

  Future<void> _onDeleteTask(DeleteTaskEvent event, Emitter<TaskState> emit) async {
    try {
      await deleteTaskUseCase.execute(event.id);
      final tasks = await getTaskUseCase.execute();
      final currentStatus = state is TaskLoaded ? (state as TaskLoaded).statusFilter : 'All';
      final currentPriority = state is TaskLoaded ? (state as TaskLoaded).priorityFilter : 'All';
      final currentQuery = state is TaskLoaded ? (state as TaskLoaded).searchQuery : '';

      emit(TaskLoaded(
        allTasks: tasks,
        filteredTasks: _applyFilters(
          tasks,
          status: currentStatus,
          priority: currentPriority,
          query: currentQuery,
        ),
        statusFilter: currentStatus,
        priorityFilter: currentPriority,
        searchQuery: currentQuery,
      ));
    } catch (e) {
      emit(TaskError('Failed to delete task: ${e.toString()}'));
    }
  }

  void _onFilterTasks(FilterTasksEvent event, Emitter<TaskState> emit) {
    if (state is TaskLoaded) {
      final current = state as TaskLoaded;
      final newStatus = event.statusFilter ?? current.statusFilter;
      final newPriority = event.priorityFilter ?? current.priorityFilter;
      final newQuery = event.searchQuery ?? current.searchQuery;

      final filtered = _applyFilters(
        current.allTasks,
        status: newStatus,
        priority: newPriority,
        query: newQuery,
      );

      emit(current.copyWith(
        filteredTasks: filtered,
        statusFilter: newStatus,
        priorityFilter: newPriority,
        searchQuery: newQuery,
      ));
    }
  }
}
