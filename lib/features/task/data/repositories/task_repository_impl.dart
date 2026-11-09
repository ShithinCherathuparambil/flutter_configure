import 'package:injectable/injectable.dart';
import '../../domain/entities/task_entity.dart';
import '../../domain/repositories/task_repository.dart';
import '../datasources/task_remote_data_source.dart';
import '../datasources/task_local_data_source.dart';
import '../models/task_model.dart';

@LazySingleton(as: TaskRepository)
class TaskRepositoryImpl implements TaskRepository {
  final TaskRemoteDataSource remoteDataSource;
  final TaskLocalDataSource localDataSource;

  TaskRepositoryImpl(this.remoteDataSource, this.localDataSource);

  @override
  Future<List<TaskEntity>> getTasks() async {
    final models = await localDataSource.getAllTasks();
    return models.map((m) => m.toEntity()).toList();
  }

  @override
  Future<TaskEntity> getTaskData() async {
    try {
      final model = await remoteDataSource.fetchTaskData();
      await localDataSource.cacheTask(model);
      return model.toEntity();
    } catch (_) {
      final cached = await localDataSource.getLastTask();
      if (cached != null) {
        return cached.toEntity();
      }
      rethrow;
    }
  }

  @override
  Future<TaskEntity> createTask(TaskEntity entity) async {
    final model = entity.toModel();
    try {
      final result = await remoteDataSource.createTask(model);
      await localDataSource.cacheTask(result);
      return result.toEntity();
    } catch (_) {
      await localDataSource.cacheTask(model);
      return entity;
    }
  }

  @override
  Future<TaskEntity> updateTask(TaskEntity entity) async {
    final model = entity.toModel();
    try {
      final result = await remoteDataSource.updateTask(model);
      await localDataSource.cacheTask(result);
      return result.toEntity();
    } catch (_) {
      await localDataSource.cacheTask(model);
      return entity;
    }
  }

  @override
  Future<TaskEntity> patchTask(dynamic id, Map<String, dynamic> data) async {
    try {
      final result = await remoteDataSource.patchTask(id, data);
      await localDataSource.cacheTask(result);
      return result.toEntity();
    } catch (_) {
      final all = await localDataSource.getAllTasks();
      final idx = all.indexWhere((t) => t.id == id.toString());
      if (idx != -1) {
        final current = all[idx];
        final updatedJson = current.toJson()..addAll(data);
        final updated = TaskModel.fromJson(updatedJson);
        await localDataSource.cacheTask(updated);
        return updated.toEntity();
      }
      final cached = await localDataSource.getLastTask();
      if (cached != null) {
        return cached.toEntity();
      }
      rethrow;
    }
  }

  @override
  Future<void> deleteTask(dynamic id) async {
    try {
      await remoteDataSource.deleteTask(id);
    } catch (_) {}
    await localDataSource.deleteTask(id);
  }
}
