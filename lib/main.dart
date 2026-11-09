import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';
import 'core/di/injection.dart';
import 'core/providers/providers.dart';
import 'core/router/app_router.dart';
import 'core/services/hive_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await HiveService().init();
  await HiveService().openBox('task_box');
  configureDependencies();
  runApp(
    MultiProvider(
      providers: getProviders(),
      child: const CleanArchitectureApp(),
    ),
  );
}

class CleanArchitectureApp extends StatelessWidget {
  const CleanArchitectureApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Clean Architecture Demo',
      routerConfig: appRouter,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
    );
  }
}
