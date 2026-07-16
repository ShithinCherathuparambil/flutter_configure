import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';
import 'features/user/data/datasources/user_remote_data_source.dart';
import 'features/user/data/repositories/user_repository_impl.dart';
import 'features/user/domain/repositories/user_repository.dart';
import 'features/user/domain/usecases/get_user_usecase.dart';
import 'features/user/presentation/bloc/user_bloc.dart';

// =======================================================
// 4. DEPENDENCY INJECTION (get_it Setup)
// =======================================================

final locator = GetIt.instance;

void setupLocator() {
  // 1. Dio
  locator.registerLazySingleton<Dio>(() => Dio());
  
  // 2. Data Source
  locator.registerLazySingleton<UserRemoteDataSource>(
    () => UserRemoteDataSource(locator<Dio>())
  );
  
  // 3. Repository
  locator.registerLazySingleton<UserRepository>(
    () => UserRepositoryImpl(locator<UserRemoteDataSource>())
  );
  
  // 4. Use Case
  locator.registerLazySingleton<GetUserUseCase>(
    () => GetUserUseCase(locator<UserRepository>())
  );
  
  // 5. BLoC
  locator.registerFactory<UserBloc>(
    () => UserBloc(locator<GetUserUseCase>())
  );
}
