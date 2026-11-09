import 'package:test_project/features/task/presentation/pages/task_page.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../di/injection.dart';
import '../../features/user/presentation/bloc/user_bloc.dart';
import '../../features/user/presentation/pages/user_profile_screen.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: TaskPage.route,
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const Scaffold(
        body: Center(child: Text('Home (Flutter Config)')),
      ),
    ),
    GoRoute(
      path: UserProfileScreen.route,
      builder: (context, state) => BlocProvider(
        create: (context) => getIt<UserBloc>(),
        child: const UserProfileScreen(),
      ),
    ),
    GoRoute(
      path: TaskPage.route,
      builder: (context, state) => const TaskPage(),
    ),
    // Routes register tag (DO NOT REMOVE)
  ],
);
