import 'package:injectable/injectable.dart';
import '../entities/task_entity.dart';
import '../repositories/task_repository.dart';

@lazySingleton
class CreateTaskUseCase {
  final TaskRepository repository;

  CreateTaskUseCase(this.repository);

  Future<TaskEntity> execute(TaskEntity entity) {
    return repository.createTask(entity);
  }
}
