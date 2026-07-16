import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/usecases/get_user_usecase.dart';
import 'user_event.dart';
import 'user_state.dart';

class UserBloc extends Bloc<UserEvent, UserState> {
  final GetUserUseCase getUserUseCase;

  UserBloc(this.getUserUseCase) : super(UserInitial()) {
    on<FetchUserEvent>((event, emit) async {
      emit(UserLoading());
      try {
        final user = await getUserUseCase.execute();
        emit(UserLoaded(user));
      } catch (e) {
        emit(UserError("Failed to fetch user data."));
      }
    });
  }
}
