import 'package:injectable/injectable.dart';
import '../entities/task_entity.dart';
import '../repositories/task_repository.dart';

@lazySingleton
class PatchTaskUseCase {
  final TaskRepository repository;

  PatchTaskUseCase(this.repository);

  Future<TaskEntity> execute(dynamic id, Map<String, dynamic> data) {
    return repository.patchTask(id, data);
  }
}
