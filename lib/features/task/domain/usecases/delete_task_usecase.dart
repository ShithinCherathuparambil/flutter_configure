import 'package:injectable/injectable.dart';
import '../repositories/task_repository.dart';

@lazySingleton
class DeleteTaskUseCase {
  final TaskRepository repository;

  DeleteTaskUseCase(this.repository);

  Future<void> execute(dynamic id) {
    return repository.deleteTask(id);
  }
}
