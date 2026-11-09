import 'package:injectable/injectable.dart';
import '../entities/task_entity.dart';
import '../repositories/task_repository.dart';

@lazySingleton
class UpdateTaskUseCase {
  final TaskRepository repository;

  UpdateTaskUseCase(this.repository);

  Future<TaskEntity> execute(TaskEntity entity) {
    return repository.updateTask(entity);
  }
}
