import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:test_project/features/task/domain/entities/task_entity.dart';
import 'package:test_project/features/task/domain/repositories/task_repository.dart';
import 'package:test_project/features/task/domain/usecases/get_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/create_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/update_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/patch_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/delete_task_usecase.dart';
import 'package:test_project/features/task/presentation/bloc/task_bloc.dart';
import 'package:test_project/features/task/presentation/pages/task_page.dart';

class MockTaskRepository implements TaskRepository {
  final List<TaskEntity> _tasks = [
    const TaskEntity(
      id: '1',
      task_title: 'Demo Task 1',
      description: 'Demo description',
      due_date: '2026-11-01',
      priority: 'High',
      status: 'Pending',
      created_date: '2026-10-31',
    ),
  ];

  @override
  Future<List<TaskEntity>> getTasks() async => _tasks;

  @override
  Future<TaskEntity> getTaskData() async => _tasks.first;

  @override
  Future<TaskEntity> createTask(TaskEntity entity) async {
    _tasks.add(entity);
    return entity;
  }

  @override
  Future<TaskEntity> updateTask(TaskEntity entity) async {
    final idx = _tasks.indexWhere((t) => t.id == entity.id);
    if (idx != -1) _tasks[idx] = entity;
    return entity;
  }

  @override
  Future<TaskEntity> patchTask(dynamic id, Map<String, dynamic> data) async => _tasks.first;

  @override
  Future<void> deleteTask(dynamic id) async {
    _tasks.removeWhere((t) => t.id == id.toString());
  }
}

void main() {
  final getIt = GetIt.instance;

  setUp(() async {
    await getIt.reset();
    final repo = MockTaskRepository();
    getIt.registerFactory<TaskBloc>(() => TaskBloc(
          getTaskUseCase: GetTaskUseCase(repo),
          createTaskUseCase: CreateTaskUseCase(repo),
          updateTaskUseCase: UpdateTaskUseCase(repo),
          patchTaskUseCase: PatchTaskUseCase(repo),
          deleteTaskUseCase: DeleteTaskUseCase(repo),
        ));
  });

  tearDown(() async {
    await getIt.reset();
  });

  testWidgets('TaskPage renders title, offline indicator, and task list', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: TaskPage(),
      ),
    );

    await tester.pumpAndSettle();

    // Verify AppBar header & Hive banner
    expect(find.text('Offline Task Manager'), findsOneWidget);
    expect(find.text('Hive Local Storage (100% Offline)'), findsOneWidget);

    // Verify task is loaded and rendered
    expect(find.text('Demo Task 1'), findsOneWidget);
    expect(find.text('Demo description'), findsOneWidget);
    expect(find.text('Due: 2026-11-01'), findsOneWidget);
    expect(find.text('High'), findsWidgets);
    expect(find.text('Pending'), findsWidgets);

    // Verify FAB
    expect(find.byType(FloatingActionButton), findsOneWidget);
  });

  testWidgets('Add Task BottomSheet opens and validates required fields', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: TaskPage(),
      ),
    );
    await tester.pumpAndSettle();

    // Tap + Add Task FAB
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();

    // Verify Modal BottomSheet is opened
    expect(find.text('Add New Task'), findsOneWidget);
    expect(find.text('Create Task'), findsOneWidget);

    // Tap Create Task without entering anything
    await tester.tap(find.text('Create Task'));
    await tester.pumpAndSettle();

    // Verify validation errors appear
    expect(find.text('Task title is mandatory'), findsOneWidget);
  });
}
