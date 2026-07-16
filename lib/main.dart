import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'features/user/presentation/bloc/user_bloc.dart';
import 'features/user/presentation/pages/user_profile_screen.dart';
import 'locator.dart';

void main() {
  setupLocator(); // Setup dependency injection
  runApp(const CleanArchitectureApp());
}

class CleanArchitectureApp extends StatelessWidget {
  const CleanArchitectureApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Clean Architecture Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: BlocProvider(
        create: (context) => locator<UserBloc>(),
        child: const UserProfileScreen(),
      ),
    );
  }
}
