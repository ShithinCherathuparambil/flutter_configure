import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/user_bloc.dart';
import '../bloc/user_event.dart';
import '../bloc/user_state.dart';

class UserProfileScreen extends StatelessWidget {
  const UserProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Clean Architecture + BLoC")),
      body: Center(
        child: BlocBuilder<UserBloc, UserState>(
          builder: (context, state) {
            if (state is UserInitial) {
              return ElevatedButton(
                onPressed: () {
                  context.read<UserBloc>().add(FetchUserEvent());
                },
                child: const Text("Load Profile Data"),
              );
            } else if (state is UserLoading) {
              return const CircularProgressIndicator();
            } else if (state is UserLoaded) {
              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.account_circle,
                    size: 100,
                    color: Colors.blue,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    state.user.name,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    state.user.email,
                    style: const TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () =>
                        context.read<UserBloc>().add(FetchUserEvent()),
                    child: const Text("Refresh Data"),
                  ),
                ],
              );
            } else if (state is UserError) {
              return Text(
                state.message,
                style: const TextStyle(color: Colors.red, fontSize: 18),
              );
            }

            return const SizedBox();
          },
        ),
      ),
    );
  }
}
