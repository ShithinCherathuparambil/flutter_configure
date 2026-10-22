import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import {
    generateCleanArchFiles,
    generateMVVMFiles,
    generateMVCFiles,
    generateCoreConfig,
    updateMainDartForRouterAndScreenUtil,
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
});
