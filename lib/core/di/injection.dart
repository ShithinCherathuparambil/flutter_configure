import 'package:dio/dio.dart';
import 'package:test_project/features/task/data/datasources/task_local_data_source.dart';
import 'package:test_project/features/task/data/datasources/task_remote_data_source.dart';
import 'package:test_project/features/task/data/repositories/task_repository_impl.dart';
import 'package:test_project/features/task/domain/repositories/task_repository.dart';
import 'package:test_project/features/task/domain/usecases/get_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/create_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/update_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/patch_task_usecase.dart';
import 'package:test_project/features/task/domain/usecases/delete_task_usecase.dart';
import 'package:test_project/features/task/presentation/bloc/task_bloc.dart';
import 'package:test_project/core/services/hive_service.dart';
import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';
import 'injection.config.dart';

final getIt = GetIt.instance;

@InjectableInit()
void configureDependencies() {
  if (!getIt.isRegistered<HiveService>()) {
    getIt.registerLazySingleton<HiveService>(() => HiveService());
  }
  getIt.init();
  
  // Task Feature

  getIt.registerLazySingleton<TaskRemoteDataSource>(
    () => TaskRemoteDataSourceImpl(getIt<Dio>()),
  );
  getIt.registerLazySingleton<TaskLocalDataSource>(
    () => TaskLocalDataSourceImpl(getIt<HiveService>()),
  );
  getIt.registerLazySingleton<TaskRepository>(
    () => TaskRepositoryImpl(
      getIt<TaskRemoteDataSource>(),
      getIt<TaskLocalDataSource>(),
    ),
  );
  getIt.registerLazySingleton<GetTaskUseCase>(
    () => GetTaskUseCase(getIt<TaskRepository>()),
  );
  getIt.registerLazySingleton<CreateTaskUseCase>(
    () => CreateTaskUseCase(getIt<TaskRepository>()),
  );
  getIt.registerLazySingleton<UpdateTaskUseCase>(
    () => UpdateTaskUseCase(getIt<TaskRepository>()),
  );
  getIt.registerLazySingleton<PatchTaskUseCase>(
    () => PatchTaskUseCase(getIt<TaskRepository>()),
  );
  getIt.registerLazySingleton<DeleteTaskUseCase>(
    () => DeleteTaskUseCase(getIt<TaskRepository>()),
  );
  getIt.registerFactory<TaskBloc>(
    () => TaskBloc(
      getTaskUseCase: getIt<GetTaskUseCase>(),
      createTaskUseCase: getIt<CreateTaskUseCase>(),
      updateTaskUseCase: getIt<UpdateTaskUseCase>(),
      patchTaskUseCase: getIt<PatchTaskUseCase>(),
      deleteTaskUseCase: getIt<DeleteTaskUseCase>(),
    ),
  );
  // Features register tag (DO NOT REMOVE)
}
