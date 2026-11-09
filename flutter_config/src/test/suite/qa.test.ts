import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

declare var suite: any;
declare var test: any;
import {
    generateCleanArchFiles,
    generateMVVMFiles,
    generateMVCFiles,
    generateCoreConfig,
    updateMainDartForRouterAndScreenUtil,
    registerRouteInGoRouter,
    registerDependenciesInLocator,
    generateEnvFile,
    generateL10nConfig,
    generateNotificationService,
    generateConnectivityFiles,
    generateSecurityFiles,
    generateThemeFiles,
    configureAndroidSigning,
    generateTestBoilerplate,
    configurePubspecForTesting,
    generateGitHubActionsWorkflow,
    generateFlavorFiles,
    generateMethodChannelDartFile,
    configureAndroidMethodChannel,
    configureIosMethodChannel,
    generatePaginatedListFiles,
    parseJsonToModel,
    configureAndroidFlavors,
    registerProviderInProvidersList,
    findDiFilePath,
    generateHiveFiles,
    configurePubspecForHive,
    updateMainDartForHive,
    addCleanArchApiAction,
    addMvvmApiAction,
    addLocalStateAction,
    ensureBuildYamlForExplicitToJson,
    FeatureModel
} from '../../extension';

suite('Comprehensive QA Test Suite', () => {
    const testModel: FeatureModel = {
        modelName: 'Product',
        modelNamePascal: 'Product',
        modelNameSnake: 'product',
        modelNameCamel: 'product',
        properties: [
            { name: 'id', type: 'int' },
            { name: 'title', type: 'String' },
            { name: 'price', type: 'double' }
        ]
    };

    const architectures = [
        'Clean Architecture (Feature-First)',
        'MVVM (Model-View-ViewModel)',
        'MVC (Model-View-Controller)'
    ];

    const stateManagers = [
        'BLoC',
        'Riverpod',
        'Provider',
        'PureBind',
        'GetX'
    ];

    // QA Test 1: Verify all 15 Architecture x State Management combinations
    architectures.forEach(arch => {
        stateManagers.forEach(stateMgmt => {
            test(`QA Matrix: ${arch} with ${stateMgmt}`, () => {
                const tempDir = path.join(__dirname, `qa_temp_${arch.slice(0, 4)}_${stateMgmt}`);
                const diDir = path.join(tempDir, 'lib', 'core', 'di');
                fs.mkdirSync(diDir, { recursive: true });
                fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\n');
                fs.writeFileSync(
                    path.join(diDir, 'injection.dart'),
                    'import "package:get_it/get_it.dart";\nfinal getIt = GetIt.instance;\nvoid setupLocator() {\n  // Features register tag (DO NOT REMOVE)\n}\n'
                );

                if (arch.includes('Clean')) {
                    // Test generation with models
                    generateCleanArchFiles(tempDir, 'product', 'Product', 'product', stateMgmt, [testModel], 'qa_app');
                    const featDir = path.join(tempDir, 'product');
                    assert.ok(fs.existsSync(path.join(featDir, 'domain', 'entities', 'product_entity.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'domain', 'usecases', 'get_product_usecase.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'data', 'models', 'product_model.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'data', 'datasources', 'product_remote_data_source.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'presentation', 'pages', 'product_page.dart')));

                    // Verify catchError sound null safety in BLoC / Riverpod
                    if (stateMgmt === 'BLoC') {
                        const blocContent = fs.readFileSync(path.join(featDir, 'presentation', 'bloc', 'product_bloc.dart'), 'utf8');
                        assert.ok(blocContent.includes('.then<ProductEntity?>((v) => v).catchError((_) => null)'));
                    } else if (stateMgmt === 'Riverpod') {
                        const providerContent = fs.readFileSync(path.join(featDir, 'presentation', 'riverpod', 'product_provider.dart'), 'utf8');
                        assert.ok(providerContent.includes('.then<ProductEntity?>((v) => v).catchError((_) => null)'));
                    } else if (stateMgmt === 'Provider') {
                        const notifierContent = fs.readFileSync(path.join(featDir, 'presentation', 'provider', 'product_notifier.dart'), 'utf8');
                        assert.ok(notifierContent.includes('class ProductNotifier extends ChangeNotifier'));
                    }

                    // Test locator registration
                    registerDependenciesInLocator(tempDir, 'product', 'Product', 'qa_app', arch, stateMgmt, [testModel]);
                    const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
                    assert.ok(diContent.includes('GetProductUseCase'));

                } else if (arch.includes('MVC')) {
                    generateMVCFiles(tempDir, 'product', 'Product', 'product', stateMgmt, [testModel], 'qa_app');
                    const featDir = path.join(tempDir, 'product');
                    assert.ok(fs.existsSync(path.join(featDir, 'models', 'product_model.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'services', 'product_api_service.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'controllers', 'product_controller.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'views', 'product_view.dart')));

                    // Test locator registration
                    registerDependenciesInLocator(tempDir, 'product', 'Product', 'qa_app', arch, stateMgmt, [testModel]);
                    const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
                    assert.ok(diContent.includes('ProductApiService'));

                } else {
                    // MVVM
                    generateMVVMFiles(tempDir, 'product', 'Product', 'product', stateMgmt, [testModel], 'qa_app');
                    const featDir = path.join(tempDir, 'product');
                    assert.ok(fs.existsSync(path.join(featDir, 'models', 'product_model.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'services', 'product_api_service.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'viewmodels', 'product_viewmodel.dart')));
                    assert.ok(fs.existsSync(path.join(featDir, 'views', 'product_view.dart')));

                    // Test locator registration
                    registerDependenciesInLocator(tempDir, 'product', 'Product', 'qa_app', arch, stateMgmt, [testModel]);
                    const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
                    assert.ok(diContent.includes('ProductApiService'));
                }

                fs.rmSync(tempDir, { recursive: true, force: true });
            });
        });
    });

    // QA Test 2: Core configuration generation
    test('QA Feature: generateCoreConfig produces valid core folders and DI', () => {
        const tempDir = path.join(__dirname, 'qa_core_config_test');
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\n');

        generateCoreConfig(tempDir);

        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'network', 'dio_configuration.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'network', 'dio_extensions.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'di', 'injection.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'router', 'app_router.dart')));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 3: updateMainDartForRouterAndScreenUtil
    test('QA Feature: updateMainDartForRouterAndScreenUtil writes ScreenUtilInit and router', () => {
        const tempDir = path.join(__dirname, 'qa_main_dart_test');
        const libDir = path.join(tempDir, 'lib');
        fs.mkdirSync(libDir, { recursive: true });
        fs.writeFileSync(path.join(libDir, 'main.dart'), 'void main() {}\n');

        updateMainDartForRouterAndScreenUtil(tempDir, 'BLoC');

        const mainContent = fs.readFileSync(path.join(libDir, 'main.dart'), 'utf8');
        assert.ok(mainContent.includes('configureDependencies();'));
        assert.ok(mainContent.includes('ScreenUtilInit('));
        assert.ok(mainContent.includes('MaterialApp.router('));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 4: Environment and Localization files
    test('QA Feature: Environment and Localization generation', () => {
        const tempDir = path.join(__dirname, 'qa_env_l10n_test');
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '# Gitignore\n');

        generateEnvFile(tempDir);
        generateL10nConfig(tempDir);

        assert.ok(fs.existsSync(path.join(tempDir, '.env')));
        assert.ok(fs.existsSync(path.join(tempDir, 'l10n.yaml')));
        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'l10n', 'app_en.arb')));

        const gitignoreContent = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
        assert.ok(gitignoreContent.includes('.env'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 5: Services (Notification, Connectivity, Security, Theme)
    test('QA Feature: Core services generation (Notification, Connectivity, Security, Theme)', () => {
        const tempDir = path.join(__dirname, 'qa_services_test');
        fs.mkdirSync(path.join(tempDir, 'lib'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'lib', 'main.dart'), 'void main() {}\n');

        generateNotificationService(tempDir);
        generateConnectivityFiles(tempDir);
        generateSecurityFiles(tempDir);
        generateThemeFiles(tempDir);

        const sDir = path.join(tempDir, 'lib', 'core', 'services');
        assert.ok(fs.existsSync(path.join(sDir, 'notification_service.dart')));
        assert.ok(fs.existsSync(path.join(sDir, 'connectivity_service.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'widgets', 'no_internet_widget.dart')));
        assert.ok(fs.existsSync(path.join(sDir, 'secure_storage_service.dart')));
        assert.ok(fs.existsSync(path.join(sDir, 'encryption_service.dart')));

        const tDir = path.join(tempDir, 'lib', 'core', 'theme');
        assert.ok(fs.existsSync(path.join(tDir, 'app_colors.dart')));
        assert.ok(fs.existsSync(path.join(tDir, 'app_text_style.dart')));
        assert.ok(fs.existsSync(path.join(tDir, 'app_theme.dart')));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 6: Android Signing Configuration
    test('QA Feature: configureAndroidSigning creates key.properties and configures Gradle', () => {
        const tempDir = path.join(__dirname, 'qa_signing_test');
        const androidAppDir = path.join(tempDir, 'android', 'app');
        fs.mkdirSync(androidAppDir, { recursive: true });
        fs.writeFileSync(path.join(androidAppDir, 'build.gradle.kts'), 'plugins {}\nandroid {}\n');

        const success = configureAndroidSigning(tempDir, 'secretpass123');
        assert.strictEqual(success, true);
        assert.ok(fs.existsSync(path.join(tempDir, 'android', 'key.properties')));

        const keyProps = fs.readFileSync(path.join(tempDir, 'android', 'key.properties'), 'utf8');
        assert.ok(keyProps.includes('storePassword=secretpass123'));
        assert.ok(keyProps.includes('keyAlias=upload'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 7: Testing Boilerplate
    test('QA Feature: generateTestBoilerplate and configurePubspecForTesting', () => {
        const tempDir = path.join(__dirname, 'qa_testing_boilerplate');
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n');

        generateTestBoilerplate(tempDir, 'BLoC');
        configurePubspecForTesting(tempDir, 'BLoC');

        assert.ok(fs.existsSync(path.join(tempDir, 'test', 'unit', 'sample_unit_test.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'test', 'widget', 'sample_widget_test.dart')));
        assert.ok(fs.existsSync(path.join(tempDir, 'integration_test', 'app_test.dart')));

        const pubspec = fs.readFileSync(path.join(tempDir, 'pubspec.yaml'), 'utf8');
        assert.ok(pubspec.includes('bloc_test:'));
        assert.ok(pubspec.includes('mocktail:'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 8: CI/CD GitHub Actions Workflow
    test('QA Feature: generateGitHubActionsWorkflow creates flutter.yml', () => {
        const tempDir = path.join(__dirname, 'qa_cicd_test');
        fs.mkdirSync(tempDir, { recursive: true });

        generateGitHubActionsWorkflow(tempDir, 'APK');

        const workflowPath = path.join(tempDir, '.github', 'workflows', 'flutter.yml');
        assert.ok(fs.existsSync(workflowPath));
        const content = fs.readFileSync(workflowPath, 'utf8');
        assert.ok(content.includes('flutter test'));
        assert.ok(content.includes('flutter build apk'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 9: Flavors Generation
    test('QA Feature: generateFlavorFiles creates dev/staging/prod entrypoints', () => {
        const tempDir = path.join(__dirname, 'qa_flavors_test');
        const libDir = path.join(tempDir, 'lib');
        fs.mkdirSync(libDir, { recursive: true });

        generateFlavorFiles(tempDir);

        assert.ok(fs.existsSync(path.join(libDir, 'main_dev.dart')));
        assert.ok(fs.existsSync(path.join(libDir, 'main_staging.dart')));
        assert.ok(fs.existsSync(path.join(libDir, 'main_prod.dart')));
        assert.ok(fs.existsSync(path.join(libDir, 'core', 'config', 'flavor_config.dart')));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 10: Method Channel Integration
    test('QA Feature: generateMethodChannelDartFile and platform configurations', () => {
        const tempDir = path.join(__dirname, 'qa_method_channel_test');
        const kotlinDir = path.join(tempDir, 'android', 'app', 'src', 'main', 'kotlin', 'com', 'example');
        const iosDir = path.join(tempDir, 'ios', 'Runner');
        fs.mkdirSync(kotlinDir, { recursive: true });
        fs.mkdirSync(iosDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\n');
        fs.writeFileSync(path.join(kotlinDir, 'MainActivity.kt'), 'class MainActivity: FlutterActivity() {}\n');
        fs.writeFileSync(path.join(iosDir, 'AppDelegate.swift'), `import UIKit
import Flutter

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`);

        generateMethodChannelDartFile(tempDir, 'device_info', 'DeviceInfo', 'getDeviceInfo', 'com.example.device');
        configureAndroidMethodChannel(tempDir, 'DeviceInfo', 'getDeviceInfo', 'com.example.device');
        configureIosMethodChannel(tempDir, 'getDeviceInfo', 'com.example.device');

        assert.ok(fs.existsSync(path.join(tempDir, 'lib', 'core', 'platform', 'device_info_channel.dart')));
        const ktContent = fs.readFileSync(path.join(kotlinDir, 'MainActivity.kt'), 'utf8');
        assert.ok(ktContent.includes('MethodChannel'));
        const swiftContent = fs.readFileSync(path.join(iosDir, 'AppDelegate.swift'), 'utf8');
        assert.ok(swiftContent.includes('FlutterMethodChannel'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 11: Paginated List Generation
    test('QA Feature: generatePaginatedListFiles creates controller and infinite scroll view', () => {
        const tempDir = path.join(__dirname, 'qa_paginated_list_test');
        fs.mkdirSync(tempDir, { recursive: true });

        generatePaginatedListFiles(tempDir, 'article', 'Article', testModel, '/articles', 'qa_app');

        const ctrlDir = path.join(tempDir, 'article', 'pagination');
        const viewDir = path.join(tempDir, 'article', 'pages');
        assert.ok(fs.existsSync(path.join(ctrlDir, 'article_pagination_controller.dart')));
        assert.ok(fs.existsSync(path.join(viewDir, 'article_list_page.dart')));

        const pageContent = fs.readFileSync(path.join(viewDir, 'article_list_page.dart'), 'utf8');
        assert.ok(pageContent.includes('ScrollController'));
        assert.ok(pageContent.includes('CircularProgressIndicator'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 12: Provider Core Config & MultiProvider in main.dart
    test('QA Feature: generateCoreConfig and updateMainDart with Provider produces MultiProvider and providers.dart', () => {
        const tempDir = path.join(__dirname, 'qa_provider_main_test');
        const libDir = path.join(tempDir, 'lib');
        fs.mkdirSync(libDir, { recursive: true });
        fs.writeFileSync(path.join(libDir, 'main.dart'), 'void main() {}\n');

        generateCoreConfig(tempDir, 'Provider');
        updateMainDartForRouterAndScreenUtil(tempDir, 'Provider');

        const providersPath = path.join(tempDir, 'lib', 'core', 'providers', 'providers.dart');
        assert.ok(fs.existsSync(providersPath));
        const providersContent = fs.readFileSync(providersPath, 'utf8');
        assert.ok(providersContent.includes('List<SingleChildWidget> getProviders()'));

        const mainContent = fs.readFileSync(path.join(libDir, 'main.dart'), 'utf8');
        assert.ok(mainContent.includes("import 'package:provider/provider.dart';"));
        assert.ok(mainContent.includes("import 'core/providers/providers.dart';"));
        assert.ok(mainContent.includes('MultiProvider('));
        assert.ok(mainContent.includes('providers: getProviders()'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 13: registerRouteInGoRouter registers route and sets initialLocation
    test('QA Feature: registerRouteInGoRouter registers screen and updates initialLocation', () => {
        const tempDir = path.join(__dirname, 'qa_router_test');
        generateCoreConfig(tempDir);

        registerRouteInGoRouter(tempDir, 'home', 'Home', 'test_app', 'Clean Architecture (Feature-First)', 'Provider');

        const routerPath = path.join(tempDir, 'lib', 'core', 'router', 'app_router.dart');
        assert.ok(fs.existsSync(routerPath));
        const routerContent = fs.readFileSync(routerPath, 'utf8');
        assert.ok(routerContent.includes("import 'package:test_app/features/home/presentation/pages/home_page.dart';"));
        assert.ok(routerContent.includes('path: HomePage.route'));
        assert.ok(routerContent.includes('initialLocation: HomePage.route'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 14: parseJsonToModel handles top-level JSON array without creating numeric field names
    test('QA Bugfix: parseJsonToModel unwraps top-level JSON array', () => {
        const jsonArray = '[{"user_id": 123, "user_name": "Antigravity", "is_admin": true}]';
        const model = parseJsonToModel('user_account', jsonArray);
        assert.strictEqual(model.modelNamePascal, 'UserAccount');
        assert.strictEqual(model.properties.length, 3);
        const propNames = model.properties.map(p => p.name);
        assert.ok(propNames.includes('user_id'));
        assert.ok(propNames.includes('user_name'));
        assert.ok(propNames.includes('is_admin'));
        assert.ok(!propNames.includes('0'));
    });

    // QA Test 15: generateCleanArchFiles maps snake_case properties to camelCase constructor args in RepositoryImpl
    test('QA Bugfix: generateCleanArchFiles maps snake_case properties to camelCase in RepositoryImpl', () => {
        const tempDir = path.join(__dirname, 'qa_snake_case_test');
        const snakeModel: FeatureModel = {
            modelName: 'UserAccount',
            modelNamePascal: 'UserAccount',
            modelNameSnake: 'user_account',
            modelNameCamel: 'userAccount',
            properties: [
                { name: 'user_id', type: 'int' },
                { name: 'user_name', type: 'String' }
            ]
        };

        generateCleanArchFiles(tempDir, 'user_account', 'UserAccount', 'userAccount', 'BLoC', [snakeModel], 'qa_app');

        const repoImplPath = path.join(tempDir, 'user_account', 'data', 'repositories', 'user_account_repository_impl.dart');
        assert.ok(fs.existsSync(repoImplPath));
        const content = fs.readFileSync(repoImplPath, 'utf8');
        assert.ok(content.includes('userId: entity.user_id'));
        assert.ok(content.includes('userName: entity.user_name'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 16: generatePaginatedListFiles imports dio.dart in page
    test('QA Bugfix: generatePaginatedListFiles imports dio.dart in list page', () => {
        const tempDir = path.join(__dirname, 'qa_paginated_dio_test');
        generatePaginatedListFiles(tempDir, 'item', 'Item', testModel, '/items', 'qa_app');

        const pagePath = path.join(tempDir, 'item', 'pages', 'item_list_page.dart');
        assert.ok(fs.existsSync(pagePath));
        const content = fs.readFileSync(pagePath, 'utf8');
        assert.ok(content.includes("import 'package:dio/dio.dart';"));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 17: configureAndroidFlavors supports Groovy build.gradle
    test('QA Bugfix: configureAndroidFlavors supports Groovy build.gradle', () => {
        const tempDir = path.join(__dirname, 'qa_groovy_flavors_test');
        const appDir = path.join(tempDir, 'android', 'app');
        fs.mkdirSync(appDir, { recursive: true });
        const gradlePath = path.join(appDir, 'build.gradle');
        fs.writeFileSync(gradlePath, `android {\n    namespace "com.example.qa"\n}\n`);

        configureAndroidFlavors(tempDir);

        const content = fs.readFileSync(gradlePath, 'utf8');
        assert.ok(content.includes('productFlavors'));
        assert.ok(content.includes('flavorDimensions "env"'));
        assert.ok(content.includes('dev {'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 18: registerDependenciesInLocator and registerProviderInProvidersList for SplashNotifier
    test('QA Bugfix: registers SplashNotifier in GetIt locator and providers.dart even with injectable enabled', () => {
        const tempDir = path.join(__dirname, 'qa_splash_notifier_test');
        const diDir = path.join(tempDir, 'lib', 'core', 'di');
        fs.mkdirSync(diDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\ndependencies:\n  injectable: ^3.0.0\n');
        fs.writeFileSync(
            path.join(diDir, 'injection.dart'),
            'import "package:get_it/get_it.dart";\nimport "package:injectable/injectable.dart";\nimport "injection.config.dart";\n\nfinal getIt = GetIt.instance;\n\n@InjectableInit()\nvoid configureDependencies() => getIt.init();\n'
        );

        // Register Splash dependencies in locator
        registerDependenciesInLocator(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)', 'Provider', []);

        const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
        assert.ok(diContent.includes('getIt.registerFactory<SplashNotifier>'), 'Should register SplashNotifier factory in GetIt');
        assert.ok(diContent.includes('() => SplashNotifier(),'), 'Should create SplashNotifier without args when 0 models');
        assert.ok(diContent.includes('getIt.init();'), 'Should preserve getIt.init() inside configureDependencies block');
        assert.ok(diContent.includes("import 'package:qa_app/features/splash/presentation/provider/splash_notifier.dart';"));

        // Register Splash provider in providers list
        registerProviderInProvidersList(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)');

        const providersPath = path.join(tempDir, 'lib', 'core', 'providers', 'providers.dart');
        assert.ok(fs.existsSync(providersPath));
        const providersContent = fs.readFileSync(providersPath, 'utf8');
        assert.ok(providersContent.includes('ChangeNotifierProvider<SplashNotifier>(create: (_) => getIt<SplashNotifier>())'));
        assert.ok(providersContent.includes("import 'package:qa_app/features/splash/presentation/provider/splash_notifier.dart';"));
        assert.ok(providersContent.includes("import 'package:qa_app/core/di/injection.dart';"));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 19: registerDependenciesInLocator with models registers usecases and passes them to SplashNotifier
    test('QA Bugfix: registerDependenciesInLocator with models wires usecase dependencies into SplashNotifier', () => {
        const tempDir = path.join(__dirname, 'qa_splash_models_test');
        const diDir = path.join(tempDir, 'lib', 'core', 'di');
        fs.mkdirSync(diDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\ndependencies:\n  injectable: ^3.0.0\n');
        fs.writeFileSync(
            path.join(diDir, 'injection.dart'),
            'import "package:get_it/get_it.dart";\nfinal getIt = GetIt.instance;\n\nvoid configureDependencies() {\n  // Features register tag (DO NOT REMOVE)\n}\n'
        );

        const splashModel: FeatureModel = {
            modelName: 'SplashConfig',
            modelNamePascal: 'SplashConfig',
            modelNameSnake: 'splash_config',
            modelNameCamel: 'splashConfig',
            properties: [{ name: 'app_title', type: 'String' }]
        };

        registerDependenciesInLocator(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)', 'Provider', [splashModel]);

        const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
        assert.ok(diContent.includes('getIt.registerLazySingleton<SplashConfigRemoteDataSource>'));
        assert.ok(diContent.includes('getIt.registerLazySingleton<SplashConfigRepository>'));
        assert.ok(diContent.includes('getIt.registerLazySingleton<GetSplashConfigUseCase>'));
        assert.ok(diContent.includes('getIt.registerFactory<SplashNotifier>'));
        assert.ok(diContent.includes('getSplashConfigUseCase: getIt<GetSplashConfigUseCase>()'));
        assert.ok(diContent.includes("import 'package:dio/dio.dart';"));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 20: Dynamic JSON parsing & nullability detection with Inspection payload and PATCH method
    test('QA Feature: Dynamic JSON parsing with envelope, nullability detection, and all HTTP methods (GET, POST, PUT, PATCH, DELETE)', () => {
        const userJson = `{"success":true,"message":null,"data":[{"id":1,"inspectionTitle":"Fire Safety Inspection","siteName":"Chennai Office","location":"Guindy, Chennai","inspectionDate":"2026-10-20","priority":"High","status":"Pending","createdOn":"2026-10-01T00:00:00Z","updatedOn":"2026-10-23T11:04:51.8210316Z"},{"id":2,"inspectionTitle":"Equipment Inspection","siteName":"Warehouse A","location":"Chennai","inspectionDate":"2026-10-21","priority":"Medium","status":"Pending","createdOn":"2026-10-01T00:00:00Z","updatedOn":"2026-10-21T10:47:23.3701551Z"},{"id":3,"inspectionTitle":"Electrical Safety Inspection","siteName":"Service Center","location":"Coimbatore","inspectionDate":"2026-10-22","priority":"High","status":"Pending","createdOn":"2026-10-01T00:00:00Z","updatedOn":null},{"id":4,"inspectionTitle":"General Workplace Inspection","siteName":"Chennai Office","location":"Guindy, Chennai","inspectionDate":"2026-10-23","priority":"Low","status":"Completed","createdOn":"2026-10-01T00:00:00Z","updatedOn":null}],"errors":null}`;

        const model = parseJsonToModel('Inspection', userJson);
        assert.strictEqual(model.modelNamePascal, 'Inspection');
        
        // Assert complete payload is parsed at root level (not discarded!)
        const rootProps = model.properties.map(p => p.name);
        assert.ok(rootProps.includes('success'), 'Should retain root success');
        assert.ok(rootProps.includes('message'), 'Should retain root message');
        assert.ok(rootProps.includes('data'), 'Should retain root data');
        assert.ok(rootProps.includes('errors'), 'Should retain root errors');

        // Assert child model is generated for nested object array
        assert.ok(model.childModels && model.childModels.length > 0, 'Must generate child models for nested array');
        const child = model.childModels![0];
        assert.strictEqual(child.modelNamePascal, 'InspectionData');

        const childProps = child.properties.map(p => p.name);
        assert.ok(childProps.includes('id'), 'Child should extract id');
        assert.ok(childProps.includes('inspectionTitle'), 'Child should extract inspectionTitle');
        assert.ok(childProps.includes('siteName'), 'Child should extract siteName');
        assert.ok(childProps.includes('location'), 'Child should extract location');
        assert.ok(childProps.includes('inspectionDate'), 'Child should extract inspectionDate');
        assert.ok(childProps.includes('priority'), 'Child should extract priority');
        assert.ok(childProps.includes('status'), 'Child should extract status');
        assert.ok(childProps.includes('createdOn'), 'Child should extract createdOn');
        assert.ok(childProps.includes('updatedOn'), 'Child should extract updatedOn');

        // Check types and nullability on child model
        const idProp = child.properties.find(p => p.name === 'id');
        assert.strictEqual(idProp?.type, 'int');

        const titleProp = child.properties.find(p => p.name === 'inspectionTitle');
        assert.strictEqual(titleProp?.type, 'String');

        const updatedProp = child.properties.find(p => p.name === 'updatedOn');
        assert.strictEqual(updatedProp?.type, 'String?', 'updatedOn should be inferred as nullable String? because items 3 & 4 have null');

        // Generate Clean Architecture files with this model
        const tempDir = path.join(__dirname, 'qa_inspection_test');
        generateCleanArchFiles(tempDir, 'inspection', 'Inspection', 'inspection', 'Provider', [model], 'qa_app');

        const featDir = path.join(tempDir, 'inspection');
        const entityPath = path.join(featDir, 'domain', 'entities', 'inspection_entity.dart');
        const modelPath = path.join(featDir, 'data', 'models', 'inspection_model.dart');
        const patchUcPath = path.join(featDir, 'domain', 'usecases', 'patch_inspection_usecase.dart');
        const dsPath = path.join(featDir, 'data', 'datasources', 'inspection_remote_data_source.dart');
        const repoPath = path.join(featDir, 'domain', 'repositories', 'inspection_repository.dart');
        const repoImplPath = path.join(featDir, 'data', 'repositories', 'inspection_repository_impl.dart');

        assert.ok(fs.existsSync(entityPath), 'Entity must exist');
        assert.ok(fs.existsSync(modelPath), 'Model must exist');
        assert.ok(fs.existsSync(patchUcPath), 'PatchUseCase must exist');
        assert.ok(fs.existsSync(dsPath), 'RemoteDataSource must exist');
        assert.ok(fs.existsSync(repoPath), 'Repository contract must exist');
        assert.ok(fs.existsSync(repoImplPath), 'Repository implementation must exist');

        const entityContent = fs.readFileSync(entityPath, 'utf8');
        assert.ok(entityContent.includes('class InspectionEntity'), 'Root entity must exist');
        assert.ok(entityContent.includes('class InspectionDataEntity'), 'Child entity must exist');
        assert.ok(entityContent.includes('final List<InspectionDataEntity>? data;'), 'Root entity must reference child entity list');
        assert.ok(entityContent.includes('final String? updatedOn;'));

        const modelContent = fs.readFileSync(modelPath, 'utf8');
        assert.ok(modelContent.includes('abstract class InspectionModel'), 'Root model must exist');
        assert.ok(modelContent.includes('abstract class InspectionDataModel'), 'Child model must exist');
        assert.ok(modelContent.includes('List<InspectionDataModel>? data'), 'Root model must reference child model list');
        assert.ok(modelContent.includes('data: data?.map((e) => e.toEntity()).toList()'), 'Deep toEntity mapper must exist');

        const patchUcContent = fs.readFileSync(patchUcPath, 'utf8');
        assert.ok(patchUcContent.includes('class PatchInspectionUseCase'));
        assert.ok(patchUcContent.includes('execute(dynamic id, Map<String, dynamic> data)'));

        const dsContent = fs.readFileSync(dsPath, 'utf8');
        assert.ok(dsContent.includes("import 'package:qa_app/core/network/dio_extensions.dart';"), 'Must import DioExtensions');
        assert.ok(dsContent.includes('dio.getRequest('), 'Must use getRequest from DioExtensions');
        assert.ok(dsContent.includes('dio.postRequest('), 'Must use postRequest from DioExtensions');
        assert.ok(dsContent.includes('dio.putRequest('), 'Must use putRequest from DioExtensions');
        assert.ok(dsContent.includes('dio.patchRequest('), 'Must use patchRequest from DioExtensions');
        assert.ok(dsContent.includes('dio.deleteRequest('), 'Must use deleteRequest from DioExtensions');

        const repoContent = fs.readFileSync(repoPath, 'utf8');
        assert.ok(repoContent.includes('Future<InspectionEntity> patchInspection(dynamic id, Map<String, dynamic> data);'));

        const repoImplContent = fs.readFileSync(repoImplPath, 'utf8');
        assert.ok(repoImplContent.includes('Future<InspectionEntity> patchInspection(dynamic id, Map<String, dynamic> data) async'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 21: DioExtensions template includes patchRequest
    test('QA Bugfix: generateCoreConfig generates DioExtensions with patchRequest', () => {
        const tempDir = path.join(__dirname, 'qa_dio_ext_test');
        fs.rmSync(tempDir, { recursive: true, force: true });
        generateCoreConfig(tempDir);

        const dioExtPath = path.join(tempDir, 'lib', 'core', 'network', 'dio_extensions.dart');
        assert.ok(fs.existsSync(dioExtPath));
        const content = fs.readFileSync(dioExtPath, 'utf8');
        assert.ok(content.includes('Future<Response<T>> patchRequest<T>('), 'DioExtensions must contain patchRequest');
        assert.ok(content.includes('await patch<T>('), 'patchRequest should call patch');
        assert.ok(content.includes('Future<Response<T>> getRequest<T>('));
        assert.ok(content.includes('Future<Response<T>> postRequest<T>('));
        assert.ok(content.includes('Future<Response<T>> putRequest<T>('));
        assert.ok(content.includes('Future<Response<T>> deleteRequest<T>('));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 22: MVC & MVVM ApiService includes all methods (GET, POST, PUT, PATCH, DELETE)
    test('QA Feature: MVC and MVVM ApiService implements all HTTP methods (GET, POST, PUT, PATCH, DELETE)', () => {
        const tempDir = path.join(__dirname, 'qa_mvc_mvvm_api_test');
        fs.rmSync(tempDir, { recursive: true, force: true });
        const sampleModel: FeatureModel = {
            modelName: 'Inspection',
            modelNamePascal: 'Inspection',
            modelNameSnake: 'inspection',
            modelNameCamel: 'inspection',
            properties: [
                { name: 'id', type: 'int' },
                { name: 'title', type: 'String' }
            ]
        };

        generateMVCFiles(tempDir, 'inspection', 'Inspection', 'inspection', 'BLoC', [sampleModel], 'qa_app');
        const mvcServicePath = path.join(tempDir, 'inspection', 'services', 'inspection_api_service.dart');
        assert.ok(fs.existsSync(mvcServicePath));
        const mvcContent = fs.readFileSync(mvcServicePath, 'utf8');
        assert.ok(mvcContent.includes('Future<InspectionModel?> getInspection();'));
        assert.ok(mvcContent.includes('Future<InspectionModel?> createInspection(InspectionModel model);'));
        assert.ok(mvcContent.includes('Future<InspectionModel?> updateInspection(InspectionModel model);'));
        assert.ok(mvcContent.includes('Future<InspectionModel?> patchInspection(dynamic id, Map<String, dynamic> data);'));
        assert.ok(mvcContent.includes('Future<bool> deleteInspection(dynamic id);'));
        assert.ok(mvcContent.includes('_parseResponse(dynamic data)'), 'ApiService should have dynamic response unwrapping helper');

        generateMVVMFiles(tempDir, 'inspection_mvvm', 'InspectionMvvm', 'inspectionMvvm', 'Provider', [sampleModel], 'qa_app');
        const mvvmServicePath = path.join(tempDir, 'inspection_mvvm', 'services', 'inspection_api_service.dart');
        assert.ok(fs.existsSync(mvvmServicePath));
        const mvvmContent = fs.readFileSync(mvvmServicePath, 'utf8');
        assert.ok(mvvmContent.includes('Future<InspectionModel?> patchInspection(dynamic id, Map<String, dynamic> data);'));
        assert.ok(mvvmContent.includes('_parseResponse(dynamic data)'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 23: findDiFilePath detects various DI file locations
    test('QA Bugfix: findDiFilePath detects various DI file locations', () => {
        const tempDir = path.join(__dirname, 'qa_find_di_test');
        fs.mkdirSync(path.join(tempDir, 'lib', 'core', 'di'), { recursive: true });
        
        // 1. Default when none exists
        assert.strictEqual(findDiFilePath(tempDir), path.join(tempDir, 'lib', 'core', 'di', 'injection.dart'));

        // 2. When lib/locator.dart exists
        const locatorPath = path.join(tempDir, 'lib', 'locator.dart');
        fs.writeFileSync(locatorPath, '// locator');
        assert.strictEqual(findDiFilePath(tempDir), locatorPath);

        // 3. When lib/core/di/injection.dart exists, it takes precedence
        const diPath = path.join(tempDir, 'lib', 'core', 'di', 'injection.dart');
        fs.writeFileSync(diPath, '// injection');
        assert.strictEqual(findDiFilePath(tempDir), diPath);

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 24: registerProviderInProvidersList guarantees GetIt registration
    test('QA Bugfix: registerProviderInProvidersList automatically registers provider in GetIt locator', () => {
        const tempDir = path.join(__dirname, 'qa_provider_guarantee_test');
        const diDir = path.join(tempDir, 'lib', 'core', 'di');
        fs.mkdirSync(diDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\n');
        fs.writeFileSync(
            path.join(diDir, 'injection.dart'),
            `import 'package:get_it/get_it.dart';
final getIt = GetIt.instance;

void configureDependencies() {
  // Features register tag (DO NOT REMOVE)
}
`
        );

        // Call registerProviderInProvidersList with 0 models
        registerProviderInProvidersList(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)', []);

        // 1. Check injection.dart has SplashNotifier registered
        const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
        assert.ok(diContent.includes('getIt.registerFactory<SplashNotifier>'), 'Must register SplashNotifier in GetIt');
        assert.ok(diContent.includes('() => SplashNotifier()'), 'Must instantiate zero-arg constructor when no models');
        assert.ok(diContent.includes("import 'package:qa_app/features/splash/presentation/provider/splash_notifier.dart';"));

        // 2. Check providers.dart has ChangeNotifierProvider<SplashNotifier>(create: (_) => getIt<SplashNotifier>())
        const providersPath = path.join(tempDir, 'lib', 'core', 'providers', 'providers.dart');
        assert.ok(fs.existsSync(providersPath));
        const providersContent = fs.readFileSync(providersPath, 'utf8');
        assert.ok(providersContent.includes('ChangeNotifierProvider<SplashNotifier>(create: (_) => getIt<SplashNotifier>())'));
        assert.ok(providersContent.includes("import 'package:qa_app/core/di/injection.dart';"));

        // 3. Test self-healing: if providers.dart had direct instantiation without getIt, it gets healed
        fs.writeFileSync(
            providersPath,
            providersContent.replace('create: (_) => getIt<SplashNotifier>()', 'create: (_) => SplashNotifier()')
        );
        registerProviderInProvidersList(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)', []);
        const healedContent = fs.readFileSync(providersPath, 'utf8');
        assert.ok(!healedContent.includes('create: (_) => SplashNotifier()'), 'Direct instantiation must be self-healed');
        assert.ok(healedContent.includes('create: (_) => getIt<SplashNotifier>()'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // 25. Clean DI formatting, auto-discovery of models, and self-healing for GetIt registrations
    test('QA 25: Clean formatting, auto-discovery of models, and self-healing in injection.dart', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_test_25_'));
        const diDir = path.join(tempDir, 'lib', 'core', 'di');
        fs.mkdirSync(diDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\n');

        const initialDi = `import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';

final getIt = GetIt.instance;

void configureDependencies() {
  // Features register tag (DO NOT REMOVE)
}
`;
        fs.writeFileSync(path.join(diDir, 'injection.dart'), initialDi);

        // 1. Verify Splash Feature generates with clean newline after comment
        registerProviderInProvidersList(tempDir, 'splash', 'Splash', 'qa_app', 'Clean Architecture (Feature-First)', []);
        let diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');

        // MUST NOT have comment swallow registration
        assert.ok(!diContent.includes('// Splash Feature  getIt'), 'Registration must not be on the same line as the comment');
        assert.ok(!diContent.includes('// Splash FeaturegetIt'), 'Comment must have newline');
        assert.match(diContent, /\/\/\s*Splash Feature\s*\n\s*getIt\.registerFactory<SplashNotifier>/, 'Must be on separate lines');

        // 2. Setup mock home feature with usecases in domain/usecases
        const usecasesDir = path.join(tempDir, 'lib', 'features', 'home', 'domain', 'usecases');
        fs.mkdirSync(usecasesDir, { recursive: true });
        fs.writeFileSync(path.join(usecasesDir, 'get_inspections_usecase.dart'), '// get usecase');
        fs.writeFileSync(path.join(usecasesDir, 'create_inspections_usecase.dart'), '// create usecase');
        fs.writeFileSync(path.join(usecasesDir, 'update_inspections_usecase.dart'), '// update usecase');
        fs.writeFileSync(path.join(usecasesDir, 'patch_inspections_usecase.dart'), '// patch usecase');
        fs.writeFileSync(path.join(usecasesDir, 'delete_inspections_usecase.dart'), '// delete usecase');

        // Auto-discover models when passing empty models array
        registerDependenciesInLocator(tempDir, 'home', 'Home', 'qa_app', 'Clean Architecture (Feature-First)', 'Provider', []);
        diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');

        assert.ok(diContent.includes('getInspectionsUseCase: getIt<GetInspectionsUseCase>()'), 'Must auto-wire discovered usecase arguments');
        assert.ok(diContent.includes('createInspectionsUseCase: getIt<CreateInspectionsUseCase>()'));
        assert.ok(diContent.includes('updateInspectionsUseCase: getIt<UpdateInspectionsUseCase>()'));
        assert.ok(diContent.includes('patchInspectionsUseCase: getIt<PatchInspectionsUseCase>()'));
        assert.ok(diContent.includes('deleteInspectionsUseCase: getIt<DeleteInspectionsUseCase>()'));

        // 3. Test self-healing of corrupted comment-swallowed registration and double semicolons
        const corruptedDi = `import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';

final getIt = GetIt.instance;

void configureDependencies() {
  // Splash Feature  getIt.registerFactory<SplashNotifier>(
    () => SplashNotifier();

  // Home Feature  getIt.registerFactory<HomeNotifier>(
    () => HomeNotifier(),
  );;
  // Features register tag (DO NOT REMOVE)
}
`;
        fs.writeFileSync(path.join(diDir, 'injection.dart'), corruptedDi);

        // Run locator registration on home
        registerDependenciesInLocator(tempDir, 'home', 'Home', 'qa_app', 'Clean Architecture (Feature-First)', 'Provider', []);
        diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');

        // Check self-healing:
        assert.ok(!diContent.includes('// Splash Feature  getIt'), 'Corrupted Splash comment must be healed');
        assert.ok(!diContent.includes('// Home Feature  getIt'), 'Corrupted Home comment must be healed');
        assert.ok(!diContent.includes(');;'), 'Double semicolons must be healed');
        assert.ok(diContent.includes('getInspectionsUseCase: getIt<GetInspectionsUseCase>()'), 'Empty constructor must be updated to pass required usecase arguments');

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // 26. Dynamic Full-JSON Parsing across nested objects, lists, MVC, MVVM, and DioExtensions
    test('QA 26: Full-JSON parsing across Clean, MVC, and MVVM with DioExtensions', () => {
        const nestedSingleJson = JSON.stringify({
            status: 'success',
            code: 200,
            result: {
                userId: 42,
                userName: 'AntigravityUser',
                email: 'user@example.com'
            }
        });

        const model = parseJsonToModel('UserAccount', nestedSingleJson);
        assert.strictEqual(model.modelNamePascal, 'UserAccount');
        const rootProps = model.properties.map(p => p.name);
        assert.ok(rootProps.includes('status'));
        assert.ok(rootProps.includes('code'));
        assert.ok(rootProps.includes('result'));

        assert.ok(model.childModels && model.childModels.length === 1);
        const child = model.childModels[0];
        assert.strictEqual(child.modelNamePascal, 'UserAccountResult');
        const childProps = child.properties.map(p => p.name);
        assert.ok(childProps.includes('userId'));
        assert.ok(childProps.includes('userName'));
        assert.ok(childProps.includes('email'));

        // Test MVC generation
        const tempMvcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_mvc_test_'));
        generateMVCFiles(tempMvcDir, 'user_account', 'UserAccount', 'userAccount', 'BLoC', [model], 'qa_mvc_app');
        const mvcModelContent = fs.readFileSync(path.join(tempMvcDir, 'user_account', 'models', 'user_account_model.dart'), 'utf8');
        assert.ok(mvcModelContent.includes('abstract class UserAccountModel'));
        assert.ok(mvcModelContent.includes('abstract class UserAccountResultModel'));

        const mvcServiceContent = fs.readFileSync(path.join(tempMvcDir, 'user_account', 'services', 'user_account_api_service.dart'), 'utf8');
        assert.ok(mvcServiceContent.includes("import 'package:qa_mvc_app/core/network/dio_extensions.dart';"));
        assert.ok(mvcServiceContent.includes('await dio.getRequest('));
        assert.ok(mvcServiceContent.includes('await dio.postRequest('));
        assert.ok(mvcServiceContent.includes('await dio.putRequest('));
        assert.ok(mvcServiceContent.includes('await dio.patchRequest('));
        assert.ok(mvcServiceContent.includes('await dio.deleteRequest('));

        // Test MVVM generation
        const tempMvvmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_mvvm_test_'));
        generateMVVMFiles(tempMvvmDir, 'user_account', 'UserAccount', 'userAccount', 'Riverpod', [model], 'qa_mvvm_app');
        const mvvmModelContent = fs.readFileSync(path.join(tempMvvmDir, 'user_account', 'models', 'user_account_model.dart'), 'utf8');
        assert.ok(mvvmModelContent.includes('abstract class UserAccountModel'));
        assert.ok(mvvmModelContent.includes('abstract class UserAccountResultModel'));

        const mvvmServiceContent = fs.readFileSync(path.join(tempMvvmDir, 'user_account', 'services', 'user_account_api_service.dart'), 'utf8');
        assert.ok(mvvmServiceContent.includes("import 'package:qa_mvvm_app/core/network/dio_extensions.dart';"));
        assert.ok(mvvmServiceContent.includes('await dio.patchRequest('));

        fs.rmSync(tempMvcDir, { recursive: true, force: true });
        fs.rmSync(tempMvvmDir, { recursive: true, force: true });
    });

    // QA Test 24: Hive initialization and configuration
    test('QA Feature: Hive initialization, pubspec configuration, and main.dart integration', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_hive_test_'));
        const libDir = path.join(tempDir, 'lib');
        fs.mkdirSync(libDir, { recursive: true });
        fs.writeFileSync(path.join(libDir, 'main.dart'), 'void main() {\n  WidgetsFlutterBinding.ensureInitialized();\n  runApp(const MyApp());\n}\n');
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_app\ndependencies:\n  flutter:\n    sdk: flutter\n');

        generateHiveFiles(tempDir);
        configurePubspecForHive(tempDir);
        updateMainDartForHive(tempDir);

        const hiveServicePath = path.join(tempDir, 'lib', 'core', 'services', 'hive_service.dart');
        assert.ok(fs.existsSync(hiveServicePath));
        const serviceContent = fs.readFileSync(hiveServicePath, 'utf8');
        assert.ok(serviceContent.includes('class HiveService'));
        assert.ok(serviceContent.includes('Future<void> init'));
        assert.ok(serviceContent.includes('Future<Box<T>> openBox<T>'));
        assert.ok(serviceContent.includes('Box<T> getBox<T>'));
        assert.ok(serviceContent.includes('Future<void> put<T>'));
        assert.ok(serviceContent.includes('T? get<T>'));
        assert.ok(serviceContent.includes('Future<void> delete'));
        assert.ok(serviceContent.includes('bool containsKey'));
        assert.ok(serviceContent.includes('List<T> getAll<T>'));
        assert.ok(serviceContent.includes('ValueListenable<Box<T>> listenable<T>'));

        const pubspecContent = fs.readFileSync(path.join(tempDir, 'pubspec.yaml'), 'utf8');
        assert.ok(pubspecContent.includes('hive: ^2.2.3'));
        assert.ok(pubspecContent.includes('hive_flutter: ^1.1.0'));

        const mainContent = fs.readFileSync(path.join(libDir, 'main.dart'), 'utf8');
        assert.ok(mainContent.includes("import 'package:hive_flutter/hive_flutter.dart';"));
        assert.ok(mainContent.includes("import 'core/services/hive_service.dart';"));
        assert.ok(mainContent.includes('void main() async {'));
        assert.ok(mainContent.includes('WidgetsFlutterBinding.ensureInitialized();'));
        assert.ok(mainContent.includes('await Hive.initFlutter();'));
        assert.ok(mainContent.includes('await HiveService().init();'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 27: Hive Screen Generation (Clean Architecture, MVVM, MVC) with JSON storage and DI
    test('QA Feature: Hive Screen Generation with dual data sources, JSON caching, and locator registration', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_hive_screen_test_'));
        const libDir = path.join(tempDir, 'lib');
        const diDir = path.join(libDir, 'core', 'di');
        fs.mkdirSync(diDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: qa_hive_app\ndependencies:\n  flutter:\n    sdk: flutter\n');
        fs.writeFileSync(
            path.join(diDir, 'injection.dart'),
            `import 'package:get_it/get_it.dart';
final getIt = GetIt.instance;

void configureDependencies() {
  // Features register tag (DO NOT REMOVE)
}
`
        );

        const inspectionModel: FeatureModel = {
            modelName: 'Inspection',
            modelNamePascal: 'Inspection',
            modelNameSnake: 'inspection',
            modelNameCamel: 'inspection',
            properties: [
                { name: 'id', type: 'int' },
                { name: 'title', type: 'String' },
                { name: 'is_synced', type: 'bool' }
            ]
        };

        // 1. Clean Architecture with Hive
        generateCleanArchFiles(tempDir, 'inspection', 'Inspection', 'inspection', 'BLoC', [inspectionModel], 'qa_hive_app', false, true);

        const localDsPath = path.join(tempDir, 'inspection', 'data', 'datasources', 'inspection_local_data_source.dart');
        assert.ok(fs.existsSync(localDsPath), 'LocalDataSource file must exist');
        const localDsContent = fs.readFileSync(localDsPath, 'utf8');
        assert.ok(localDsContent.includes('abstract class InspectionLocalDataSource'));
        assert.ok(localDsContent.includes('class InspectionLocalDataSourceImpl implements InspectionLocalDataSource'));
        assert.ok(localDsContent.includes("static const String boxName = 'inspection_box';"));
        assert.ok(localDsContent.includes("static const String cacheKey = 'cached_inspection';"));
        assert.ok(localDsContent.includes('model.toJson()'), 'Must persist model as JSON map');
        assert.ok(localDsContent.includes('InspectionModel.fromJson('), 'Must deserialize cached JSON map');

        const repoImplPath = path.join(tempDir, 'inspection', 'data', 'repositories', 'inspection_repository_impl.dart');
        assert.ok(fs.existsSync(repoImplPath));
        const repoImplContent = fs.readFileSync(repoImplPath, 'utf8');
        assert.ok(repoImplContent.includes('final InspectionRemoteDataSource remoteDataSource;'));
        assert.ok(repoImplContent.includes('final InspectionLocalDataSource localDataSource;'));
        assert.ok(repoImplContent.includes('await localDataSource.cacheInspection(model);'));
        assert.ok(repoImplContent.includes('final cached = await localDataSource.getLastInspection();'));

        // Register in locator
        registerDependenciesInLocator(tempDir, 'inspection', 'Inspection', 'qa_hive_app', 'Clean Architecture (Feature-First)', 'BLoC', [inspectionModel], true);
        const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
        assert.ok(diContent.includes('getIt.registerLazySingleton<HiveService>'));
        assert.ok(diContent.includes('getIt.registerLazySingleton<InspectionLocalDataSource>'));
        assert.ok(diContent.includes('getIt<InspectionLocalDataSource>()'));

        // 2. MVVM with Hive
        const mvvmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_hive_mvvm_test_'));
        generateMVVMFiles(mvvmDir, 'task', 'Task', 'task', 'Riverpod', [inspectionModel], 'qa_hive_app', false, true);
        const mvvmLocalServicePath = path.join(mvvmDir, 'task', 'services', 'inspection_local_service.dart');
        assert.ok(fs.existsSync(mvvmLocalServicePath));
        const mvvmLocalContent = fs.readFileSync(mvvmLocalServicePath, 'utf8');
        assert.ok(mvvmLocalContent.includes('class InspectionLocalServiceImpl implements InspectionLocalService'));
        assert.ok(mvvmLocalContent.includes('model.toJson()'));

        // 3. MVC with Hive
        const mvcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_hive_mvc_test_'));
        generateMVCFiles(mvcDir, 'order', 'Order', 'order', 'Provider', [inspectionModel], 'qa_hive_app', false, true);
        const mvcLocalServicePath = path.join(mvcDir, 'order', 'services', 'inspection_local_service.dart');
        assert.ok(fs.existsSync(mvcLocalServicePath));
        const mvcLocalContent = fs.readFileSync(mvcLocalServicePath, 'utf8');
        assert.ok(mvcLocalContent.includes('class InspectionLocalServiceImpl implements InspectionLocalService'));
        assert.ok(mvcLocalContent.includes('InspectionModel.fromJson('));

        // 4. Update main.dart with feature box pre-opening
        const mainPath = path.join(libDir, 'main.dart');
        fs.writeFileSync(mainPath, 'void main() {\n  runApp(const MyApp());\n}\n');
        updateMainDartForHive(tempDir, ['inspection_box', 'order_box']);
        const updatedMain = fs.readFileSync(mainPath, 'utf8');
        assert.ok(updatedMain.includes("await HiveService().openBox('inspection_box');"));
        assert.ok(updatedMain.includes("await HiveService().openBox('order_box');"));

        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(mvvmDir, { recursive: true, force: true });
        fs.rmSync(mvcDir, { recursive: true, force: true });
    });

    // QA Test 28: API Action Generation in Clean Architecture
    test('QA Feature: addCleanArchApiAction updates datasource, repository, and usecase', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_action_clean_'));
        const featuresDir = path.join(tempDir, 'lib', 'features');
        fs.mkdirSync(featuresDir, { recursive: true });

        const profileModel: FeatureModel = {
            modelName: 'Profile',
            modelNamePascal: 'Profile',
            modelNameSnake: 'profile',
            modelNameCamel: 'profile',
            properties: [{ name: 'id', type: 'int' }]
        };
        // Generate baseline clean architecture files
        generateCleanArchFiles(featuresDir, 'profile', 'Profile', 'profile', 'BLoC', [profileModel], 'qa_action_app');

        // Add API Action
        await addCleanArchApiAction(
            tempDir,
            'profile',
            'Profile',
            'uploadAvatar',
            'UploadAvatar',
            'POST',
            '/profile/avatar',
            'BLoC',
            'qa_action_app',
            null
        );

        const usecasePath = path.join(tempDir, 'lib', 'features', 'profile', 'domain', 'usecases', 'upload_avatar_usecase.dart');
        assert.ok(fs.existsSync(usecasePath), 'UploadAvatar usecase must be generated');
        const ucContent = fs.readFileSync(usecasePath, 'utf8');
        assert.ok(ucContent.includes('class UploadAvatarUseCase'));
        assert.ok(ucContent.includes('Future<void> execute()'));

        const dsPath = path.join(tempDir, 'lib', 'features', 'profile', 'data', 'datasources', 'profile_remote_data_source.dart');
        assert.ok(fs.existsSync(dsPath));
        const dsContent = fs.readFileSync(dsPath, 'utf8');
        assert.ok(dsContent.includes('uploadAvatar'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 29: Local State Action Generation in MVVM
    test('QA Feature: addLocalStateAction updates ViewModel with local state action', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_action_mvvm_'));
        const vmDir = path.join(tempDir, 'lib', 'features', 'cart', 'viewmodels');
        fs.mkdirSync(vmDir, { recursive: true });

        const vmPath = path.join(vmDir, 'cart_viewmodel.dart');
        fs.writeFileSync(vmPath, 'class CartViewModel {\n}\n');

        await addLocalStateAction(
            tempDir,
            'cart',
            'Cart',
            'toggleSelectAll',
            'ToggleSelectAll',
            'Provider',
            'MVVM (Model-View-ViewModel)',
            'qa_action_app'
        );

        const vmContent = fs.readFileSync(vmPath, 'utf8');
        assert.ok(vmContent.includes('Future<void> toggleSelectAll()'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 30: Nested Child Model Mapping & fromEntity in Clean Architecture
    test('QA Bugfix: generateCleanArchFiles maps nested child model entities to models in RepositoryImpl and generates fromEntity', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_nested_models_'));
        const featuresDir = path.join(tempDir, 'lib', 'features');
        fs.mkdirSync(featuresDir, { recursive: true });

        const childTaskData: FeatureModel = {
            modelName: 'TaskData',
            modelNamePascal: 'TaskData',
            modelNameSnake: 'task_data',
            modelNameCamel: 'taskData',
            properties: [
                { name: 'id', type: 'int' },
                { name: 'name', type: 'String' }
            ]
        };

        const parentTaskModel: FeatureModel = {
            modelName: 'Task',
            modelNamePascal: 'Task',
            modelNameSnake: 'task',
            modelNameCamel: 'task',
            properties: [
                { name: 'id', type: 'int' },
                {
                    name: 'tasks',
                    type: 'List<TaskDataModel>?',
                    isNestedList: true,
                    childModelPascal: 'TaskData'
                }
            ],
            childModels: [childTaskData]
        };

        generateCleanArchFiles(featuresDir, 'task', 'Task', 'task', 'BLoC', [parentTaskModel], 'qa_task_app', false, true);

        // Check model file has fromEntity and extension
        const modelPath = path.join(featuresDir, 'task', 'data', 'models', 'task_model.dart');
        assert.ok(fs.existsSync(modelPath));
        const modelContent = fs.readFileSync(modelPath, 'utf8');
        assert.ok(modelContent.includes('factory TaskModel.fromEntity(TaskEntity entity)'));
        assert.ok(modelContent.includes('factory TaskDataModel.fromEntity(TaskDataEntity entity)'));
        assert.ok(modelContent.includes('extension TaskEntityToModel on TaskEntity'));
        assert.ok(modelContent.includes('extension TaskDataEntityToModel on TaskDataEntity'));

        // Check repository impl maps tasks using TaskDataModel.fromEntity
        const repoImplPath = path.join(featuresDir, 'task', 'data', 'repositories', 'task_repository_impl.dart');
        assert.ok(fs.existsSync(repoImplPath));
        const repoContent = fs.readFileSync(repoImplPath, 'utf8');
        assert.ok(repoContent.includes('tasks: entity.tasks?.map((e) => TaskDataModel.fromEntity(e)).toList()'));

        // Check local data source has jsonDecode(jsonEncode(rawData)) and jsonDecode(jsonEncode(model.toJson()))
        const localDsPath = path.join(featuresDir, 'task', 'data', 'datasources', 'task_local_data_source.dart');
        assert.ok(fs.existsSync(localDsPath));
        const localDsContent = fs.readFileSync(localDsPath, 'utf8');
        assert.ok(localDsContent.includes("import 'dart:convert';"));
        assert.ok(localDsContent.includes('jsonDecode(jsonEncode(rawData))'));
        assert.ok(localDsContent.includes('jsonDecode(jsonEncode(model.toJson()))'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 31: PatchUseCase constructor alignment across all State Managers
    test('QA Bugfix: BLoC, PureBind, GetX, and Provider constructors declare patchUseCase matching injection.dart', () => {
        const managers = ['BLoC', 'Provider', 'PureBind', 'GetX'];
        const taskModel: FeatureModel = {
            modelName: 'Task',
            modelNamePascal: 'Task',
            modelNameSnake: 'task',
            modelNameCamel: 'task',
            properties: [
                { name: 'id', type: 'int' },
                { name: 'title', type: 'String' }
            ]
        };

        for (const mgmt of managers) {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `qa_patch_align_${mgmt}_`));
            const featuresDir = path.join(tempDir, 'lib', 'features');
            const diDir = path.join(tempDir, 'lib', 'core', 'di');
            fs.mkdirSync(featuresDir, { recursive: true });
            fs.mkdirSync(diDir, { recursive: true });

            fs.writeFileSync(
                path.join(diDir, 'injection.dart'),
                'import "package:get_it/get_it.dart";\nfinal getIt = GetIt.instance;\nvoid setupLocator() {\n  // Features register tag (DO NOT REMOVE)\n}\n'
            );

            generateCleanArchFiles(featuresDir, 'task', 'Task', 'task', mgmt, [taskModel], 'qa_patch_app', false, false);
            registerDependenciesInLocator(tempDir, 'task', 'Task', 'qa_patch_app', 'Clean Architecture (Feature-First)', mgmt, [taskModel], false);

            const diContent = fs.readFileSync(path.join(diDir, 'injection.dart'), 'utf8');
            assert.ok(diContent.includes('patchTaskUseCase: getIt<PatchTaskUseCase>()'), `injection.dart missing patchTaskUseCase for ${mgmt}`);

            if (mgmt === 'BLoC') {
                const blocContent = fs.readFileSync(path.join(featuresDir, 'task', 'presentation', 'bloc', 'task_bloc.dart'), 'utf8');
                assert.ok(blocContent.includes('required this.patchTaskUseCase,'), 'TaskBloc missing required this.patchTaskUseCase');
                assert.ok(blocContent.includes('final PatchTaskUseCase patchTaskUseCase;'), 'TaskBloc missing patchTaskUseCase field');
                assert.ok(blocContent.includes("import '../../domain/usecases/patch_task_usecase.dart';"), 'TaskBloc missing patch_task_usecase import');
            } else if (mgmt === 'Provider') {
                const notifierContent = fs.readFileSync(path.join(featuresDir, 'task', 'presentation', 'provider', 'task_notifier.dart'), 'utf8');
                assert.ok(notifierContent.includes('required this.patchTaskUseCase,'), 'TaskNotifier missing required this.patchTaskUseCase');
                assert.ok(notifierContent.includes('final PatchTaskUseCase patchTaskUseCase;'), 'TaskNotifier missing patchTaskUseCase field');
            } else if (mgmt === 'PureBind') {
                const ctrlContent = fs.readFileSync(path.join(featuresDir, 'task', 'presentation', 'controllers', 'task_controller.dart'), 'utf8');
                assert.ok(ctrlContent.includes('required this.patchTaskUseCase,'), 'TaskController (PureBind) missing required this.patchTaskUseCase');
            } else if (mgmt === 'GetX') {
                const ctrlContent = fs.readFileSync(path.join(featuresDir, 'task', 'presentation', 'controllers', 'task_controller.dart'), 'utf8');
                assert.ok(ctrlContent.includes('required this.patchTaskUseCase,'), 'TaskController (GetX) missing required this.patchTaskUseCase');
            }

            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    // QA Test 32: ensureBuildYamlForExplicitToJson creates and configures build.yaml with explicit_to_json: true
    test('QA Bugfix: ensureBuildYamlForExplicitToJson creates and configures build.yaml with explicit_to_json: true', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_build_yaml_'));
        ensureBuildYamlForExplicitToJson(tempDir);

        const yamlPath = path.join(tempDir, 'build.yaml');
        assert.ok(fs.existsSync(yamlPath));
        const content = fs.readFileSync(yamlPath, 'utf8');
        assert.ok(content.includes('json_serializable:'));
        assert.ok(content.includes('explicit_to_json: true'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 33: Complete Offline Feature generation with Hive
    test('QA Feature: Complete Offline Feature generation with Hive creates full CRUD data source, usecases, BLoC events, and interactive UI', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_offline_feature_'));
        const taskModel: FeatureModel = {
            modelName: 'Task',
            modelNamePascal: 'Task',
            modelNameSnake: 'task',
            modelNameCamel: 'task',
            properties: [
                { name: 'id', type: 'String' },
                { name: 'task_title', type: 'String' },
                { name: 'description', type: 'String' },
                { name: 'due_date', type: 'String' },
                { name: 'priority', type: 'String' },
                { name: 'status', type: 'String' },
                { name: 'created_date', type: 'String' }
            ]
        };

        generateCleanArchFiles(tempDir, 'task', 'Task', 'task', 'BLoC', [taskModel], 'qa_offline_app', false, true);

        // 1. Entity has copyWith and isCompleted
        const entityPath = path.join(tempDir, 'task', 'domain', 'entities', 'task_entity.dart');
        assert.ok(fs.existsSync(entityPath));
        const entityContent = fs.readFileSync(entityPath, 'utf8');
        assert.ok(entityContent.includes('TaskEntity copyWith('), 'Entity must include copyWith');
        assert.ok(entityContent.includes('bool get isCompleted => status?.toString().toLowerCase() == \'completed\';'), 'Entity must include isCompleted getter');

        // 2. Repository contract has getTaskList
        const repoPath = path.join(tempDir, 'task', 'domain', 'repositories', 'task_repository.dart');
        assert.ok(fs.existsSync(repoPath));
        const repoContent = fs.readFileSync(repoPath, 'utf8');
        assert.ok(repoContent.includes('Future<List<TaskEntity>> getTaskList();'), 'Repository must include getTaskList()');

        // 3. LocalDataSource has full collection CRUD
        const localDsPath = path.join(tempDir, 'task', 'data', 'datasources', 'task_local_data_source.dart');
        assert.ok(fs.existsSync(localDsPath));
        const localDsContent = fs.readFileSync(localDsPath, 'utf8');
        assert.ok(localDsContent.includes('Future<List<TaskModel>> getAll();'), 'LocalDataSource must include getAll()');
        assert.ok(localDsContent.includes('Future<TaskModel?> getById(dynamic id);'), 'LocalDataSource must include getById()');
        assert.ok(localDsContent.includes('Future<void> save(TaskModel model);'), 'LocalDataSource must include save()');
        assert.ok(localDsContent.includes('Future<void> update(TaskModel model);'), 'LocalDataSource must include update()');
        assert.ok(localDsContent.includes('Future<void> delete(dynamic id);'), 'LocalDataSource must include delete()');
        assert.ok(localDsContent.includes('Future<void> clear();'), 'LocalDataSource must include clear()');

        // 4. RepositoryImpl implements getTaskList and individual delete
        const repoImplPath = path.join(tempDir, 'task', 'data', 'repositories', 'task_repository_impl.dart');
        assert.ok(fs.existsSync(repoImplPath));
        const repoImplContent = fs.readFileSync(repoImplPath, 'utf8');
        assert.ok(repoImplContent.includes('Future<List<TaskEntity>> getTaskList() async'), 'RepositoryImpl must implement getTaskList()');
        assert.ok(repoImplContent.includes('await localDataSource.delete(id);'), 'RepositoryImpl must delete single item by id, not clearCache()');

        // 5. BLoC events and state have full CRUD and filter support
        const eventPath = path.join(tempDir, 'task', 'presentation', 'bloc', 'task_event.dart');
        assert.ok(fs.existsSync(eventPath));
        const eventContent = fs.readFileSync(eventPath, 'utf8');
        assert.ok(eventContent.includes('class LoadTaskListEvent extends TaskEvent'));
        assert.ok(eventContent.includes('class AddTaskEvent extends TaskEvent'));
        assert.ok(eventContent.includes('class UpdateTaskEvent extends TaskEvent'));
        assert.ok(eventContent.includes('class ToggleTaskStatusEvent extends TaskEvent'));
        assert.ok(eventContent.includes('class DeleteTaskEvent extends TaskEvent'));
        assert.ok(eventContent.includes('class FilterTaskEvent extends TaskEvent'));

        const statePath = path.join(tempDir, 'task', 'presentation', 'bloc', 'task_state.dart');
        assert.ok(fs.existsSync(statePath));
        const stateContent = fs.readFileSync(statePath, 'utf8');
        assert.ok(stateContent.includes('final List<TaskEntity> allItems;'));
        assert.ok(stateContent.includes('final List<TaskEntity> filteredItems;'));
        assert.ok(stateContent.includes('final String searchQuery;'));
        assert.ok(stateContent.includes('final String statusFilter;'));
        assert.ok(stateContent.includes('final String priorityFilter;'));

        // 6. UI Page is rich interactive CRUD
        const pagePath = path.join(tempDir, 'task', 'presentation', 'pages', 'task_page.dart');
        assert.ok(fs.existsSync(pagePath));
        const pageContent = fs.readFileSync(pagePath, 'utf8');
        assert.ok(pageContent.includes('class TaskView extends StatefulWidget'));
        assert.ok(pageContent.includes('Hive Local Storage (100% Offline)'));
        assert.ok(pageContent.includes('FloatingActionButton.extended'));
        assert.ok(pageContent.includes('showModalBottomSheet'));
        assert.ok(pageContent.includes('ListView.separated'));
        assert.ok(pageContent.includes('Dismissible'));

        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // QA Test 34: Universal Arbitrary JSON CRUD operations (no ID, int ID, custom ID, envelope, no status)
    test('QA Feature: Universal Hive Offline CRUD supports arbitrary JSON inputs (no id, int id, custom id, envelope, no status)', () => {
        // 1. JSON with NO ID (should synthesize id: String?)
        const noIdModel = parseJsonToModel('Task', JSON.stringify({ taskTitle: 'Arbitrary Task', description: 'No ID field' }));
        assert.ok(noIdModel.properties.some(p => p.name === 'id'), 'Model without ID must synthesize an id property');

        // 2. JSON with int ID
        const intIdModel = parseJsonToModel('Product', JSON.stringify({ id: 101, name: 'Keyboard', price: 49.99, inStock: true }));
        const idProp = intIdModel.properties.find(p => p.name === 'id');
        assert.strictEqual(idProp?.type, 'int', 'Integer ID must be typed as int');

        // 3. JSON with custom ID key
        const customIdModel = parseJsonToModel('Note', JSON.stringify({ taskId: 't-99', content: 'Note content' }));
        assert.ok(customIdModel.properties.some(p => p.name === 'taskId'), 'Custom ID key must be preserved');

        // 4. Generate Clean Architecture feature for int ID model
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_universal_json_'));
        generateCleanArchFiles(tempDir, 'product', 'Product', 'product', 'BLoC', [intIdModel], 'qa_universal_app', false, true);

        // Verify entity has copyWith and isCompleted
        const entityContent = fs.readFileSync(path.join(tempDir, 'product', 'domain', 'entities', 'product_entity.dart'), 'utf8');
        assert.ok(entityContent.includes('ProductEntity copyWith('), 'Entity must have copyWith');
        assert.ok(entityContent.includes('bool get isCompleted => false;'), 'Entity without status property must safely return false for isCompleted');

        // Verify page UI assigns integer timestamp (not .toString()) for int ID
        const pageContent = fs.readFileSync(path.join(tempDir, 'product', 'presentation', 'pages', 'product_page.dart'), 'utf8');
        assert.ok(pageContent.includes('DateTime.now().millisecondsSinceEpoch,'), 'Integer ID in form submission must assign int timestamp');
        assert.ok(!pageContent.includes('id: DateTime.now().millisecondsSinceEpoch.toString(),'), 'Integer ID must not assign String timestamp');
        assert.ok(pageContent.includes('SwitchListTile'), 'Boolean inStock property must render SwitchListTile');
        assert.ok(pageContent.includes('keyboardType: const TextInputType.numberWithOptions'), 'Double/Int price property must render numeric keyboard');

        // 5. Envelope JSON unwrapping to child CRUD entity
        const envelopeModel = parseJsonToModel('TaskList', JSON.stringify({
            status: 'success',
            data: [{ id: 1, title: 'Item 1' }]
        }));
        const envelopeModels = [envelopeModel, ...(envelopeModel.childModels || [])];
        const envelopeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa_envelope_json_'));
        generateCleanArchFiles(envelopeDir, 'task_list', 'TaskList', 'taskList', 'BLoC', envelopeModels, 'qa_envelope_app', false, true);
        const envelopePage = fs.readFileSync(path.join(envelopeDir, 'task_list', 'presentation', 'pages', 'task_list_page.dart'), 'utf8');
        assert.ok(envelopePage.includes('TaskListDataEntity'), 'Envelope list must target child model TaskListDataEntity as the primary CRUD entity');

        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(envelopeDir, { recursive: true, force: true });
    });
});
