import 'package:injectable/injectable.dart';
import '../entities/user_entity.dart';
import '../repositories/user_repository.dart';

@lazySingleton
class GetUserUseCase {
  final UserRepository repository;

  GetUserUseCase(this.repository);

  Future<UserEntity> execute() {
    return repository.getUserProfile();
  }
}
