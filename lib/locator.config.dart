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
import 'package:test_project/core/dio_configuration.dart' as _i169;
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
    gh.lazySingleton<_i303.UserRepository>(
      () => _i409.UserRepositoryImpl(gh<_i1009.UserRemoteDataSource>()),
    );
    gh.lazySingleton<_i320.GetUserUseCase>(
      () => _i320.GetUserUseCase(gh<_i303.UserRepository>()),
    );
    gh.factory<_i877.UserBloc>(
      () => _i877.UserBloc(gh<_i320.GetUserUseCase>()),
    );
    return this;
  }
}

class _$DioModule extends _i169.DioModule {}
