import 'package:injectable/injectable.dart';
import '../entities/task_entity.dart';
import '../repositories/task_repository.dart';

@lazySingleton
class GetTaskUseCase {
  final TaskRepository repository;

  GetTaskUseCase(this.repository);

  Future<List<TaskEntity>> execute() {
    return repository.getTasks();
  }
}
