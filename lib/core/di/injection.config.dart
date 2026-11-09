// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format width=80

// **************************************************************************
// InjectableConfigGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

// ignore_for_file: no_leading_underscores_for_library_prefixes
import 'package:dio/dio.dart' as _i361;
import 'package:get_it/get_it.dart' as _i174;
import 'package:injectable/injectable.dart' as _i526;
import 'package:test_project/core/network/dio_configuration.dart' as _i917;
import 'package:test_project/core/services/hive_service.dart' as _i933;
import 'package:test_project/features/task/data/datasources/task_local_data_source.dart'
    as _i570;
import 'package:test_project/features/task/data/datasources/task_remote_data_source.dart'
    as _i154;
import 'package:test_project/features/task/data/repositories/task_repository_impl.dart'
    as _i111;
import 'package:test_project/features/task/domain/repositories/task_repository.dart'
    as _i73;
import 'package:test_project/features/task/domain/usecases/create_task_usecase.dart'
    as _i360;
import 'package:test_project/features/task/domain/usecases/delete_task_usecase.dart'
    as _i96;
import 'package:test_project/features/task/domain/usecases/get_task_usecase.dart'
    as _i573;
import 'package:test_project/features/task/domain/usecases/patch_task_usecase.dart'
    as _i435;
import 'package:test_project/features/task/domain/usecases/update_task_usecase.dart'
    as _i193;
import 'package:test_project/features/task/presentation/bloc/task_bloc.dart'
    as _i194;
import 'package:test_project/features/user/data/datasources/user_remote_data_source.dart'
    as _i1009;
import 'package:test_project/features/user/data/repositories/user_repository_impl.dart'
    as _i409;
import 'package:test_project/features/user/domain/repositories/user_repository.dart'
    as _i303;
import 'package:test_project/features/user/domain/usecases/get_user_usecase.dart'
    as _i320;
import 'package:test_project/features/user/presentation/bloc/user_bloc.dart'
    as _i877;

extension GetItInjectableX on _i174.GetIt {
  // initializes the registration of main-scope dependencies inside of GetIt
  _i174.GetIt init({
    String? environment,
    _i526.EnvironmentFilter? environmentFilter,
  }) {
    final gh = _i526.GetItHelper(this, environment, environmentFilter);
    final dioModule = _$DioModule();
    gh.lazySingleton<_i361.Dio>(() => dioModule.dio);
    gh.lazySingleton<_i1009.UserRemoteDataSource>(
      () => _i1009.UserRemoteDataSource(gh<_i361.Dio>()),
    );
    gh.lazySingleton<_i570.TaskLocalDataSource>(
      () => _i570.TaskLocalDataSourceImpl(gh<_i933.HiveService>()),
    );
    gh.lazySingleton<_i154.TaskRemoteDataSource>(
      () => _i154.TaskRemoteDataSourceImpl(gh<_i361.Dio>()),
    );
    gh.lazySingleton<_i303.UserRepository>(
      () => _i409.UserRepositoryImpl(gh<_i1009.UserRemoteDataSource>()),
    );
    gh.lazySingleton<_i73.TaskRepository>(
      () => _i111.TaskRepositoryImpl(
        gh<_i154.TaskRemoteDataSource>(),
        gh<_i570.TaskLocalDataSource>(),
      ),
    );
    gh.lazySingleton<_i360.CreateTaskUseCase>(
      () => _i360.CreateTaskUseCase(gh<_i73.TaskRepository>()),
    );
    gh.lazySingleton<_i96.DeleteTaskUseCase>(
      () => _i96.DeleteTaskUseCase(gh<_i73.TaskRepository>()),
    );
    gh.lazySingleton<_i573.GetTaskUseCase>(
      () => _i573.GetTaskUseCase(gh<_i73.TaskRepository>()),
    );
    gh.lazySingleton<_i435.PatchTaskUseCase>(
      () => _i435.PatchTaskUseCase(gh<_i73.TaskRepository>()),
    );
    gh.lazySingleton<_i193.UpdateTaskUseCase>(
      () => _i193.UpdateTaskUseCase(gh<_i73.TaskRepository>()),
    );
    gh.lazySingleton<_i320.GetUserUseCase>(
      () => _i320.GetUserUseCase(gh<_i303.UserRepository>()),
    );
    gh.factory<_i194.TaskBloc>(
      () => _i194.TaskBloc(
        getTaskUseCase: gh<_i573.GetTaskUseCase>(),
        createTaskUseCase: gh<_i360.CreateTaskUseCase>(),
        updateTaskUseCase: gh<_i193.UpdateTaskUseCase>(),
        patchTaskUseCase: gh<_i435.PatchTaskUseCase>(),
        deleteTaskUseCase: gh<_i96.DeleteTaskUseCase>(),
      ),
    );
    gh.factory<_i877.UserBloc>(
      () => _i877.UserBloc(gh<_i320.GetUserUseCase>()),
    );
    return this;
  }
}

class _$DioModule extends _i917.DioModule {}
