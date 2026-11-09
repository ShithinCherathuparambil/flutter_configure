import 'package:injectable/injectable.dart';
import 'dart:convert';
import 'package:test_project/core/services/hive_service.dart';
import '../models/task_model.dart';

abstract class TaskLocalDataSource {
  Future<TaskModel?> getLastTask();
  Future<List<TaskModel>> getAllTasks();
  Future<void> cacheTask(TaskModel model);
  Future<void> deleteTask(dynamic id);
  Future<void> clearCache();
}

@LazySingleton(as: TaskLocalDataSource)
class TaskLocalDataSourceImpl implements TaskLocalDataSource {
  final HiveService hiveService;
  static const String boxName = 'task_box';
  static const String cacheKey = 'cached_task';

  TaskLocalDataSourceImpl([HiveService? hiveService])
      : hiveService = hiveService ?? HiveService();

  @override
  Future<TaskModel?> getLastTask() async {
    final box = await hiveService.openBox(boxName);
    final rawData = box.get(cacheKey);
    if (rawData != null) {
      final json = jsonDecode(jsonEncode(rawData)) as Map<String, dynamic>;
      return TaskModel.fromJson(json);
    }
    final all = await getAllTasks();
    if (all.isNotEmpty) return all.first;
    return null;
  }

  @override
  Future<List<TaskModel>> getAllTasks() async {
    final box = await hiveService.openBox(boxName);
    final list = <TaskModel>[];
    for (final key in box.keys) {
      if (key == cacheKey) continue;
      final rawData = box.get(key);
      if (rawData != null) {
        try {
          final json = jsonDecode(jsonEncode(rawData)) as Map<String, dynamic>;
          list.add(TaskModel.fromJson(json));
        } catch (_) {}
      }
    }
    list.sort((a, b) => b.createdDate.compareTo(a.createdDate));
    return list;
  }

  @override
  Future<void> cacheTask(TaskModel model) async {
    final rawJson = jsonDecode(jsonEncode(model.toJson()));
    await hiveService.put(model.id, rawJson, boxName: boxName);
    await hiveService.put(cacheKey, rawJson, boxName: boxName);
  }

  @override
  Future<void> deleteTask(dynamic id) async {
    await hiveService.delete(id.toString(), boxName: boxName);
  }

  @override
  Future<void> clearCache() async {
    await hiveService.clear(boxName: boxName);
  }
}
