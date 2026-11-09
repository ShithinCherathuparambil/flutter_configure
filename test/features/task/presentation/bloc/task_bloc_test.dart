import 'package:flutter_test/flutter_test.dart';
import 'package:test_project/features/task/domain/entities/task_entity.dart';
import 'package:test_project/features/task/domain/repositories/task_repository.dart';
import 'package:test_project/features/task/domain/usecases/get_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/create_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/update_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/patch_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/delete_task_usecase.dart';
import 'package:test_project/features/task/presentation/bloc/task_bloc.dart';

class FakeTaskRepository implements TaskRepository {
  final List<TaskEntity> _tasks = [];

  @override
  Future<List<TaskEntity>> getTasks() async => List.unmodifiable(_tasks);

  @override
  Future<TaskEntity> getTaskData() async {
    if (_tasks.isNotEmpty) return _tasks.first;
    throw Exception('No tasks');
  }

  @override
  Future<TaskEntity> createTask(TaskEntity entity) async {
    _tasks.add(entity);
    return entity;
  }

  @override
  Future<TaskEntity> updateTask(TaskEntity entity) async {
    final idx = _tasks.indexWhere((t) => t.id == entity.id);
    if (idx != -1) {
      _tasks[idx] = entity;
    }
    return entity;
  }

  @override
  Future<TaskEntity> patchTask(dynamic id, Map<String, dynamic> data) async {
    final idx = _tasks.indexWhere((t) => t.id == id.toString());
    if (idx != -1) {
      final cur = _tasks[idx];
      final updated = cur.copyWith(
        task_title: data['task_title'] as String?,
        status: data['status'] as String?,
      );
      _tasks[idx] = updated;
      return updated;
    }
    throw Exception('Not found');
  }

  @override
  Future<void> deleteTask(dynamic id) async {
    _tasks.removeWhere((t) => t.id == id.toString());
  }
}

void main() {
  late FakeTaskRepository repository;
  late TaskBloc taskBloc;

  setUp(() {
    repository = FakeTaskRepository();
    taskBloc = TaskBloc(
      getTaskUseCase: GetTaskUseCase(repository),
      createTaskUseCase: CreateTaskUseCase(repository),
      updateTaskUseCase: UpdateTaskUseCase(repository),
      patchTaskUseCase: PatchTaskUseCase(repository),
      deleteTaskUseCase: DeleteTaskUseCase(repository),
    );
  });

  tearDown(() {
    taskBloc.close();
  });

  test('initial state is TaskInitial', () {
    expect(taskBloc.state, isA<TaskInitial>());
  });

  test('LoadTasksEvent emits TaskLoading then TaskLoaded', () async {
    final expectedStates = [
      isA<TaskLoading>(),
      isA<TaskLoaded>(),
    ];

    expectLater(taskBloc.stream, emitsInOrder(expectedStates));
    taskBloc.add(LoadTasksEvent());
  });

  test('AddTaskEvent adds a task and updates TaskLoaded state', () async {
    const task = TaskEntity(
      id: '1',
      task_title: 'Unit Test Task',
      description: 'Testing task creation',
      due_date: '2026-11-01',
      priority: 'High',
      status: 'Pending',
      created_date: '2026-10-31',
    );

    taskBloc.add(AddTaskEvent(task));

    await expectLater(
      taskBloc.stream,
      emits(predicate<TaskState>((state) {
        if (state is TaskLoaded) {
          return state.allTasks.length == 1 &&
              state.allTasks.first.task_title == 'Unit Test Task' &&
              state.filteredTasks.length == 1;
        }
        return false;
      })),
    );
  });

  test('ToggleTaskStatusEvent toggles Pending to Completed', () async {
    const task = TaskEntity(
      id: '1',
      task_title: 'Toggle Task',
      description: '',
      due_date: '2026-11-01',
      priority: 'Medium',
      status: 'Pending',
      created_date: '2026-10-31',
    );

    taskBloc.add(AddTaskEvent(task));
    await Future.delayed(const Duration(milliseconds: 50));

    taskBloc.add(ToggleTaskStatusEvent(task));

    await expectLater(
      taskBloc.stream,
      emits(predicate<TaskState>((state) {
        if (state is TaskLoaded) {
          return state.allTasks.first.status == 'Completed';
        }
        return false;
      })),
    );
  });

  test('FilterTasksEvent filters tasks by status and priority', () async {
    const task1 = TaskEntity(
      id: '1',
      task_title: 'Task 1',
      description: '',
      due_date: '2026-11-01',
      priority: 'High',
      status: 'Pending',
      created_date: '2026-10-31',
    );
    const task2 = TaskEntity(
      id: '2',
      task_title: 'Task 2',
      description: '',
      due_date: '2026-11-02',
      priority: 'Low',
      status: 'Completed',
      created_date: '2026-10-31',
    );

    taskBloc.add(AddTaskEvent(task1));
    await Future.delayed(const Duration(milliseconds: 20));
    taskBloc.add(AddTaskEvent(task2));
    await Future.delayed(const Duration(milliseconds: 20));

    // Filter by Completed
    taskBloc.add(FilterTasksEvent(statusFilter: 'Completed'));
    await expectLater(
      taskBloc.stream,
      emits(predicate<TaskState>((state) {
        if (state is TaskLoaded) {
          return state.filteredTasks.length == 1 &&
              state.filteredTasks.first.id == '2';
        }
        return false;
      })),
    );

    // Filter by Priority High
    taskBloc.add(FilterTasksEvent(statusFilter: 'All', priorityFilter: 'High'));
    await expectLater(
      taskBloc.stream,
      emits(predicate<TaskState>((state) {
        if (state is TaskLoaded) {
          return state.filteredTasks.length == 1 &&
              state.filteredTasks.first.id == '1';
        }
        return false;
      })),
    );
  });

  test('DeleteTaskEvent removes the task from the list', () async {
    const task = TaskEntity(
      id: '99',
      task_title: 'Delete Me',
      description: '',
      due_date: '2026-11-01',
      priority: 'Low',
      status: 'Pending',
      created_date: '2026-10-31',
    );

    taskBloc.add(AddTaskEvent(task));
    await Future.delayed(const Duration(milliseconds: 20));

    taskBloc.add(DeleteTaskEvent('99'));
    await expectLater(
      taskBloc.stream,
      emits(predicate<TaskState>((state) {
        if (state is TaskLoaded) {
          return state.allTasks.isEmpty && state.filteredTasks.isEmpty;
        }
        return false;
      })),
    );
  });
}

