import '../entities/task_entity.dart';

abstract class TaskRepository {
  Future<List<TaskEntity>> getTasks();
  Future<TaskEntity> getTaskData();
  Future<TaskEntity> createTask(TaskEntity entity);
  Future<TaskEntity> updateTask(TaskEntity entity);
  Future<TaskEntity> patchTask(dynamic id, Map<String, dynamic> data);
  Future<void> deleteTask(dynamic id);
}
