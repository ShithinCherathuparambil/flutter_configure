import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:test_project/core/services/hive_service.dart';
import 'package:test_project/features/task/data/datasources/task_local_data_source.dart';
import 'package:test_project/features/task/data/models/task_model.dart';

void main() {
  late Directory tempDir;
  late HiveService hiveService;
  late TaskLocalDataSourceImpl localDataSource;

  setUp(() async {
    tempDir = Directory.systemTemp.createTempSync('hive_disk_test_');
    Hive.init(tempDir.path);
    hiveService = HiveService();
    localDataSource = TaskLocalDataSourceImpl(hiveService);
  });

  tearDown(() async {
    await Hive.close();
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
  });

  test('Checkpoint 6.1 & 6.2 — Real Hive Filesystem I/O and Cold Restart Survival', () async {
    const task1 = TaskModel(
      id: 'task_001',
      taskTitle: 'Offline Architecture Implementation',
      description: 'Persistent local storage using Hive',
      dueDate: '2026-11-01',
      priority: 'High',
      status: 'Pending',
      createdDate: '2026-10-31T10:00:00.000Z',
    );

    const task2 = TaskModel(
      id: 'task_002',
      taskTitle: 'Write Widget Integration Tests',
      description: 'Verify form validation and UI',
      dueDate: '2026-11-02',
      priority: 'Medium',
      status: 'Completed',
      createdDate: '2026-10-31T12:00:00.000Z',
    );

    // 1. Save tasks into real Hive box
    await localDataSource.cacheTask(task1);
    await localDataSource.cacheTask(task2);

    // 2. Verify both tasks are readable
    final initialList = await localDataSource.getAllTasks();
    expect(initialList.length, 2);

    // 3. SIMULATE COLD RESTART: Close the box completely
    final box = await hiveService.openBox('task_box');
    await box.close();
    expect(hiveService.isBoxOpen('task_box'), false);

    // 4. RE-OPEN FROM DISK: Reconnect to real filesystem files
    final reopenedBox = await hiveService.openBox('task_box');
    expect(reopenedBox.isOpen, true);

    // 5. Verify all data survived the cold restart completely
    final restoredList = await localDataSource.getAllTasks();
    expect(restoredList.length, 2);

    final restoredTask1 = restoredList.firstWhere((t) => t.id == 'task_001');
    expect(restoredTask1.taskTitle, 'Offline Architecture Implementation');
    expect(restoredTask1.priority, 'High');
    expect(restoredTask1.status, 'Pending');

    final restoredTask2 = restoredList.firstWhere((t) => t.id == 'task_002');
    expect(restoredTask2.taskTitle, 'Write Widget Integration Tests');
    expect(restoredTask2.status, 'Completed');
  });

  test('Checkpoint 6.3 — Chronological Sorting (descending by createdDate)', () async {
    const taskEarly = TaskModel(
      id: 'early_01',
      taskTitle: 'Early Task',
      description: '',
      dueDate: '2026-11-01',
      priority: 'Low',
      status: 'Pending',
      createdDate: '2026-10-30T08:00:00.000Z',
    );

    const taskLate = TaskModel(
      id: 'late_02',
      taskTitle: 'Late Task',
      description: '',
      dueDate: '2026-11-01',
      priority: 'High',
      status: 'Pending',
      createdDate: '2026-10-31T18:00:00.000Z',
    );

    await localDataSource.cacheTask(taskEarly);
    await localDataSource.cacheTask(taskLate);

    final tasks = await localDataSource.getAllTasks();
    expect(tasks.first.id, 'late_02');
    expect(tasks.last.id, 'early_01');
  });

  test('Checkpoint 6.4 — Single Item Deletion & Corrupt Data Resilience', () async {
    const taskA = TaskModel(
      id: 'A',
      taskTitle: 'Task A',
      description: '',
      dueDate: '2026-11-01',
      priority: 'Low',
      status: 'Pending',
      createdDate: '2026-10-31T10:00:00Z',
    );
    const taskB = TaskModel(
      id: 'B',
      taskTitle: 'Task B',
      description: '',
      dueDate: '2026-11-01',
      priority: 'Medium',
      status: 'Pending',
      createdDate: '2026-10-31T11:00:00Z',
    );

    await localDataSource.cacheTask(taskA);
    await localDataSource.cacheTask(taskB);

    // Delete item A
    await localDataSource.deleteTask('A');

    final remaining = await localDataSource.getAllTasks();
    expect(remaining.length, 1);
    expect(remaining.first.id, 'B');

    // Inject corrupted unparseable object into box
    final box = await hiveService.openBox('task_box');
    await box.put('corrupted_key', 'this is not a valid JSON map');

    // Verify getAllTasks() does not crash, ignores corrupt entry, and returns valid item
    final resilientList = await localDataSource.getAllTasks();
    expect(resilientList.length, 1);
    expect(resilientList.first.id, 'B');
  });
}

