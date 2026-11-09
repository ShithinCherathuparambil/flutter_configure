import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execFile } from 'child_process';

export interface ModelProperty {
    name: string;
    type: string;
    isNestedModel?: boolean;
    isNestedList?: boolean;
    childModelName?: string;
    childModelPascal?: string;
}

export interface FeatureModel {
    modelName: string;
    modelNamePascal: string;
    modelNameSnake: string;
    modelNameCamel: string;
    properties: ModelProperty[];
    childModels?: FeatureModel[];
    isRootList?: boolean;
}

export const ARCHITECTURE_OPTIONS = [
    'Clean Architecture (Feature-First)',
    'MVVM (Model-View-ViewModel)',
    'MVC (Model-View-Controller)',
];

export const STATE_MANAGEMENT_OPTIONS = [
    'BLoC',
    'Riverpod',
    'Provider',
    'PureBind',
    'GetX',
];

export function activate(context: vscode.ExtensionContext) {
    // Register Code Actions Provider for Quick Fix (lightbulb)
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'dart' },
            new ScreenCodeActionProvider(),
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        )
    );

    // 1. Command: Initialize Architecture
    let initDisposable = vscode.commands.registerCommand('flutter-config.init', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Choose Architecture
        const archType = await vscode.window.showQuickPick(
            ARCHITECTURE_OPTIONS,
            { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
        );
        if (!archType) return;

        // Choose State Management
        const stateManagement = await vscode.window.showQuickPick(
            STATE_MANAGEMENT_OPTIONS,
            { placeHolder: 'Select State Management Tool', ignoreFocusOut: true }
        );
        if (!stateManagement) return;

        // Save selected choices to vscode workspace configuration
        const config = vscode.workspace.getConfiguration('flutterConfig');
        await config.update('architecture', archType, vscode.ConfigurationTarget.Workspace);
        await config.update('stateManagement', stateManagement, vscode.ConfigurationTarget.Workspace);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing architecture setup...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Installing packages..." });
            const pubAddOk = await installDependencies(rootPath, stateManagement);

            progress.report({ message: "Generating core configuration..." });
            generateCoreConfig(rootPath);
            updateMainDartForRouterAndScreenUtil(rootPath, stateManagement);

            progress.report({ message: "Configuring lint rules..." });
            configurePubspecForLints(rootPath, false);
            generateAnalysisOptions(rootPath, archType, stateManagement);

            if (pubAddOk) {
                vscode.window.showInformationMessage(`Flutter Config Initialized with ${archType} and ${stateManagement}!`);
            } else {
                vscode.window.showWarningMessage(`Flutter Config generated core files for ${archType} and ${stateManagement}, but package installation failed. Run 'flutter pub get' and check your pubspec.yaml before building.`);
            }
        });
    });

    // 2. Command: Create New Screen
    let createScreenDisposable = vscode.commands.registerCommand('flutter-config.createScreen', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Get saved configurations
        const config = vscode.workspace.getConfiguration('flutterConfig');
        let arch = config.get<string>('architecture');
        let stateMgmt = config.get<string>('stateManagement');

        if (!arch || !stateMgmt) {
            vscode.window.showWarningMessage('Flutter Config is not initialized yet. Please initialize first.');
            arch = await vscode.window.showQuickPick(
                ARCHITECTURE_OPTIONS,
                { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
            );
            stateMgmt = await vscode.window.showQuickPick(
                STATE_MANAGEMENT_OPTIONS,
                { placeHolder: 'Select State Management Tool', ignoreFocusOut: true }
            );
            if (!arch || !stateMgmt) return;
        }

        // Get Screen/Feature Name
        const screenInput = await vscode.window.showInputBox({
            prompt: 'Enter Screen / Feature Name (e.g. Home, ProductDetail, login)',
            placeHolder: 'FeatureName',
            ignoreFocusOut: true
        });
        if (!screenInput) return;

        const featureName = toSnakeCase(screenInput);
        const featurePascal = toPascalCase(screenInput);
        const featureCamel = toCamelCase(screenInput);

        const models = await promptForModels(featurePascal, featureName, featureCamel);
        const useHive = await promptForHive(featurePascal);

        // Determine destination folder
        let targetDir = uri ? uri.fsPath : path.join(rootPath, 'lib', 'features');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Determine package name
        let packageName = getPackageName(rootPath);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${featurePascal} Feature...`,
            cancellable: false
        }, async (progress) => {
            if (useHive) {
                progress.report({ message: "Configuring Hive local database..." });
                const boxNames = models.length > 0 ? models.map(m => `${m.modelNameSnake}_box`) : [`${featureName}_box`];
                await ensureHiveEnvironment(rootPath, boxNames);
            }
            if (!fs.existsSync(path.join(rootPath, 'lib', 'core', 'di', 'injection.dart'))) {
                generateCoreConfig(rootPath);
            }
            if (arch?.includes('Clean')) {
                generateCleanArchFiles(targetDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, false, useHive);
            } else if (arch?.includes('MVC')) {
                generateMVCFiles(targetDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, false, useHive);
            } else {
                generateMVVMFiles(targetDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, false, useHive);
            }

            registerDependenciesInLocator(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt!, models, useHive);
            registerRouteInGoRouter(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt);

            progress.report({ message: "Running Build Runner to generate files..." });
            await runBuildRunner(rootPath);

            vscode.window.showInformationMessage(`Successfully generated ${featurePascal} feature, route, and registered dependencies!`);
        });
    });

    // 3. Command: Generate for Existing Screen (Quick Fix command)
    let generateForExistingScreenDisposable = vscode.commands.registerCommand('flutter-config.generateForExistingScreen', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;
        const filePath = uri.fsPath;

        // Get saved configurations
        const config = vscode.workspace.getConfiguration('flutterConfig');
        let arch = config.get<string>('architecture');
        let stateMgmt = config.get<string>('stateManagement');

        if (!arch || !stateMgmt) {
            vscode.window.showWarningMessage('Flutter Config is not initialized yet. Please initialize first.');
            arch = await vscode.window.showQuickPick(
                ARCHITECTURE_OPTIONS,
                { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
            );
            stateMgmt = await vscode.window.showQuickPick(
                STATE_MANAGEMENT_OPTIONS,
                { placeHolder: 'Select State Management Tool', ignoreFocusOut: true }
            );
            if (!arch || !stateMgmt) return;
        }

        const baseName = path.basename(filePath, '.dart');
        const featureName = baseName.replace(/_(page|screen|view)$/i, '');
        const featurePascal = toPascalCase(featureName);
        const featureCamel = toCamelCase(featureName);

        // Find root features directory
        let featuresDir = path.dirname(filePath);
        while (featuresDir && path.basename(featuresDir) !== 'features' && featuresDir !== rootPath) {
            featuresDir = path.dirname(featuresDir);
        }

        if (path.basename(featuresDir) !== 'features') {
            featuresDir = path.join(rootPath, 'lib', 'features');
        }

        // Ask for JSON API models
        const models = await promptForModels(featurePascal, featureName, featureCamel);
        const useHive = await promptForHive(featurePascal);

        // Determine package name
        let packageName = getPackageName(rootPath);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Configs for Existing ${featurePascal} Screen...`,
            cancellable: false
        }, async (progress) => {
            if (useHive) {
                progress.report({ message: "Configuring Hive local database..." });
                const boxNames = models.length > 0 ? models.map(m => `${m.modelNameSnake}_box`) : [`${featureName}_box`];
                await ensureHiveEnvironment(rootPath, boxNames);
            }
            if (!fs.existsSync(path.join(rootPath, 'lib', 'core', 'di', 'injection.dart'))) {
                generateCoreConfig(rootPath);
            }
            if (arch?.includes('Clean')) {
                generateCleanArchFiles(featuresDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, true, useHive);
            } else if (arch?.includes('MVC')) {
                generateMVCFiles(featuresDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, true, useHive);
            } else {
                generateMVVMFiles(featuresDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, true, useHive);
            }

            registerDependenciesInLocator(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt!, models, useHive);
            registerRouteInGoRouter(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt);

            progress.report({ message: "Running Build Runner to generate files..." });
            await runBuildRunner(rootPath);

            vscode.window.showInformationMessage(`Successfully generated layers and router config for existing screen ${featurePascal}!`);
        });
    });

    // Command: Create Cubit (for BLoC state management)
    let createCubitDisposable = vscode.commands.registerCommand('flutter-config.createCubit', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        const config = vscode.workspace.getConfiguration('flutterConfig');
        const arch = config.get<string>('architecture');
        const stateMgmt = config.get<string>('stateManagement');

        if (!arch?.includes('Clean') || stateMgmt !== 'BLoC') {
            vscode.window.showErrorMessage('Create Cubit requires "Clean Architecture (Feature-First)" and "BLoC" as the selected setup. Run "Flutter Config: Initialize Architecture" first.');
            return;
        }

        const cubitInput = await vscode.window.showInputBox({
            prompt: 'Enter Cubit name (e.g. Counter, ProfileSettings)',
            placeHolder: 'CubitName',
            ignoreFocusOut: true
        });
        if (!cubitInput) return;

        const cubitName = toSnakeCase(cubitInput);
        const cubitPascal = toPascalCase(cubitInput);

        const methodInput = await vscode.window.showInputBox({
            prompt: 'Enter initial method/function name for this Cubit (e.g. increment, updateProfile)',
            placeHolder: 'increment',
            ignoreFocusOut: true
        });
        if (!methodInput) return;

        const methodCamel = toCamelCase(methodInput);

        let targetDir = uri ? uri.fsPath : path.join(rootPath, 'lib', 'features');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const cubitDir = path.join(targetDir, 'cubit');
        fs.mkdirSync(cubitDir, { recursive: true });

        const statePath = path.join(cubitDir, `${cubitName}_state.dart`);
        const cubitPath = path.join(cubitDir, `${cubitName}_cubit.dart`);

        if (fs.existsSync(statePath) || fs.existsSync(cubitPath)) {
            vscode.window.showErrorMessage(`Cubit "${cubitPascal}" already exists in ${cubitDir}.`);
            return;
        }

        const stateTemplate = `part of '${cubitName}_cubit.dart';

abstract class ${cubitPascal}State {}

class ${cubitPascal}Initial extends ${cubitPascal}State {}
`;
        fs.writeFileSync(statePath, stateTemplate);

        const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
        const cubitInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const cubitInjectableAnnot = useInjectable ? "@injectable\n" : "";

        const cubitTemplate = `import 'package:flutter_bloc/flutter_bloc.dart';
${cubitInjectableImport}
part '${cubitName}_state.dart';

${cubitInjectableAnnot}class ${cubitPascal}Cubit extends Cubit<${cubitPascal}State> {
  ${cubitPascal}Cubit() : super(${cubitPascal}Initial());

  Future<void> ${methodCamel}() async {
    // TODO: Implement ${methodCamel} logic here
  }
}
`;
        fs.writeFileSync(cubitPath, cubitTemplate);

        vscode.window.showInformationMessage(`Successfully created ${cubitPascal}Cubit with ${methodCamel}() in ${cubitDir}!`);
    });

    let generateApiActionDisposable = vscode.commands.registerCommand('flutter-config.generateApiAction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const document = editor.document;
        const selection = editor.selection;
        const position = selection.active;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;
        const filePath = document.fileName;

        const featureDirMatch = filePath.match(/lib\/features\/([a-zA-Z0-9_\-]+)/);
        if (!featureDirMatch) {
            vscode.window.showErrorMessage('This file is not inside a recognized feature folder (lib/features/...).');
            return;
        }
        const featureName = featureDirMatch[1];
        const featurePascal = toPascalCase(featureName);
        const featureCamel = toCamelCase(featureName);

        const config = vscode.workspace.getConfiguration('flutterConfig');
        let arch = config.get<string>('architecture') || 'Clean Architecture (Feature-First)';
        let stateMgmt = config.get<string>('stateManagement') || 'BLoC';

        const actionNameInput = await vscode.window.showInputBox({
            prompt: 'Enter action/function name (e.g. updateProfile, deleteBanner)',
            placeHolder: 'updateProfile',
            ignoreFocusOut: true
        });
        if (!actionNameInput) return;

        const actionCamel = toCamelCase(actionNameInput);
        const actionPascal = toPascalCase(actionNameInput);

        const httpMethod = await vscode.window.showQuickPick(
            ['GET', 'POST', 'PUT', 'DELETE'],
            { placeHolder: 'Select HTTP Method for this API call', ignoreFocusOut: true }
        );
        if (!httpMethod) return;

        const endpoint = await vscode.window.showInputBox({
            prompt: 'Enter API endpoint path (e.g. /profile/update)',
            placeHolder: '/profile/update',
            ignoreFocusOut: true
        });
        if (!endpoint) return;

        const inputJson = await vscode.window.showInputBox({
            prompt: `Paste JSON response for "${actionPascal}" to generate response model automatically (Optional)`,
            placeHolder: '{"id": 1, "title": "Example"}',
            ignoreFocusOut: true
        });

        let responseModel: FeatureModel | null = null;
        if (inputJson && inputJson.trim() !== '') {
            responseModel = parseJsonToModel(`${actionPascal}Response`, inputJson);
        }

        let packageName = getPackageName(rootPath);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Adding API Action ${actionPascal} (${httpMethod})...`,
            cancellable: false
        }, async (progress) => {
            if (arch.includes('Clean')) {
                await addCleanArchApiAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, httpMethod, endpoint, stateMgmt, packageName, responseModel);
            } else if (arch.includes('MVC')) {
                await addMvvmApiAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, httpMethod, endpoint, stateMgmt, packageName, responseModel, true);
            } else {
                await addMvvmApiAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, httpMethod, endpoint, stateMgmt, packageName, responseModel, false);
            }

            editor.edit((editBuilder) => {
                editBuilder.insert(position, buildActionCallSnippet(stateMgmt, arch, featureCamel, featurePascal, actionCamel, actionPascal));
            });

            vscode.window.showInformationMessage(`Successfully generated API Action ${actionPascal} and inserted callback trigger!`);
        });
    });

    let generateLocalStateActionDisposable = vscode.commands.registerCommand('flutter-config.generateLocalStateAction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const document = editor.document;
        const selection = editor.selection;
        const position = selection.active;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;
        const filePath = document.fileName;

        const featureDirMatch = filePath.match(/lib\/features\/([a-zA-Z0-9_\-]+)/);
        if (!featureDirMatch) {
            vscode.window.showErrorMessage('This file is not inside a recognized feature folder (lib/features/...).');
            return;
        }
        const featureName = featureDirMatch[1];
        const featurePascal = toPascalCase(featureName);
        const featureCamel = toCamelCase(featureName);

        const config = vscode.workspace.getConfiguration('flutterConfig');
        let arch = config.get<string>('architecture') || 'Clean Architecture (Feature-First)';
        let stateMgmt = config.get<string>('stateManagement') || 'BLoC';

        const actionNameInput = await vscode.window.showInputBox({
            prompt: 'Enter local action/function name (e.g. toggleWidget, changeColor, deleteItem)',
            placeHolder: 'toggleWidget',
            ignoreFocusOut: true
        });
        if (!actionNameInput) return;

        const actionCamel = toCamelCase(actionNameInput);
        const actionPascal = toPascalCase(actionNameInput);

        let packageName = getPackageName(rootPath);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Adding Local State Action ${actionPascal}...`,
            cancellable: false
        }, async (progress) => {
            await addLocalStateAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, stateMgmt, arch, packageName);

            editor.edit((editBuilder) => {
                editBuilder.insert(position, buildActionCallSnippet(stateMgmt, arch, featureCamel, featurePascal, actionCamel, actionPascal));
            });

            vscode.window.showInformationMessage(`Successfully generated Local State Action ${actionPascal} and inserted callback trigger!`);
        });
    });

    let initEnvDisposable = vscode.commands.registerCommand('flutter-config.initEnv', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Env Configuration...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding flutter_dotenv dependency..." });
            const pubAddOk = await runPubAdd('flutter_dotenv', rootPath);

            progress.report({ message: "Configuring assets and files..." });
            const envAlreadyExisted = fs.existsSync(path.join(rootPath, '.env'));
            configurePubspecForEnvAndL10n(rootPath);
            generateEnvFile(rootPath);
            updateMainDartForEnv(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Initialized .env configuration, but 'flutter pub add flutter_dotenv' failed. Run it manually before building.");
            } else if (envAlreadyExisted) {
                vscode.window.showInformationMessage(".env already existed and was left unchanged; pubspec and main.dart integration were refreshed.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized .env configuration and integrated it into main.dart!");
            }
        });
    });

    let initLocalizationDisposable = vscode.commands.registerCommand('flutter-config.initLocalization', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Localization...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding localization dependencies..." });
            const pubAddOk = await runPubAdd('intl', rootPath);

            progress.report({ message: "Configuring pubspec.yaml for localization..." });
            const l10nAlreadyExisted = fs.existsSync(path.join(rootPath, 'l10n.yaml'));
            configurePubspecForEnvAndL10n(rootPath);
            generateL10nConfig(rootPath);
            updateMainDartForLocalization(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Initialized Localization files, but 'flutter pub add intl' failed. Run it manually before building.");
            } else if (l10nAlreadyExisted) {
                vscode.window.showInformationMessage("Localization config already existed and was left unchanged; pubspec and main.dart integration were refreshed.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized Localization configuration, ARB files, BuildContext extension, and integrated it into main.dart!");
            }
        });
    });

    let initNotificationsDisposable = vscode.commands.registerCommand('flutter-config.initNotifications', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Push Notifications...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding Firebase and notification dependencies..." });
            const pubAddOk = await runPubAdd('firebase_core firebase_messaging flutter_local_notifications', rootPath);

            progress.report({ message: "Configuring AndroidManifest.xml and Info.plist..." });
            const notificationServiceAlreadyExisted = fs.existsSync(path.join(rootPath, 'lib', 'core', 'services', 'notification_service.dart'));
            configureAndroidManifestForNotifications(rootPath);
            configureInfoPlistForNotifications(rootPath);
            generateNotificationService(rootPath);
            updateMainDartForNotifications(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Configured notification platform files, but the dependency install failed. Run 'flutter pub add firebase_core firebase_messaging flutter_local_notifications' manually.");
            } else if (notificationServiceAlreadyExisted) {
                vscode.window.showInformationMessage("notification_service.dart already existed and was left unchanged; platform files and main.dart integration were refreshed.");
            } else {
                vscode.window.showInformationMessage("Successfully configured Firebase Push & Local Notifications, updated platform files, and integrated into main.dart!");
            }
        });
    });

    let initConnectivityDisposable = vscode.commands.registerCommand('flutter-config.initConnectivity', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Connectivity Service...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding connectivity_plus dependency..." });
            const pubAddOk = await runPubAdd('connectivity_plus', rootPath);

            progress.report({ message: "Generating Connectivity Service & No Internet screen..." });
            const connectivityAlreadyExisted = fs.existsSync(path.join(rootPath, 'lib', 'core', 'services', 'connectivity_service.dart'));
            generateConnectivityFiles(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Generated Connectivity Service files, but 'flutter pub add connectivity_plus' failed. Run it manually before building.");
            } else if (connectivityAlreadyExisted) {
                vscode.window.showInformationMessage("connectivity_service.dart already existed and was left unchanged.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized Connectivity Service and added the No Internet Widget!");
            }
        });
    });

    let initSecurityDisposable = vscode.commands.registerCommand('flutter-config.initSecurity', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Security configurations...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding secure storage and encryption dependencies..." });
            const pubAddOk = await runPubAdd('flutter_secure_storage encrypt crypto', rootPath);

            progress.report({ message: "Generating Secure Storage and Encryption services..." });
            const secureStorageAlreadyExisted = fs.existsSync(path.join(rootPath, 'lib', 'core', 'services', 'secure_storage_service.dart'));
            generateSecurityFiles(rootPath);
            updateDioForSslPinning(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Generated Security config files, but the dependency install failed. Run 'flutter pub add flutter_secure_storage encrypt crypto' manually.");
            } else if (secureStorageAlreadyExisted) {
                vscode.window.showInformationMessage("secure_storage_service.dart already existed and was left unchanged; SSL pinning hook was refreshed in dio_configuration.dart.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized Security config (Secure Storage, AES, and SSL Pinning support)!");
            }
        });
    });

    let initHiveDisposable = vscode.commands.registerCommand('flutter-config.initHive', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Hive Local Database...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding Hive dependencies..." });
            const pubAddOk = await runPubAdd('hive hive_flutter', rootPath);

            progress.report({ message: "Configuring pubspec.yaml for Hive..." });
            configurePubspecForHive(rootPath);

            progress.report({ message: "Generating Hive Service..." });
            const hiveAlreadyExisted = fs.existsSync(path.join(rootPath, 'lib', 'core', 'services', 'hive_service.dart'));
            generateHiveFiles(rootPath);
            updateMainDartForHive(rootPath);

            if (!pubAddOk) {
                vscode.window.showWarningMessage("Generated Hive config files, but dependency install failed. Run 'flutter pub add hive hive_flutter' manually.");
            } else if (hiveAlreadyExisted) {
                vscode.window.showInformationMessage("hive_service.dart already existed and was left unchanged; main.dart integration was refreshed.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized Hive local database and integrated it into main.dart!");
            }
        });
    });

    let initThemeDisposable = vscode.commands.registerCommand('flutter-config.initTheme', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Theme configurations...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Generating App Colors, TextStyles, and ThemeData templates..." });
            const themeAlreadyExisted = fs.existsSync(path.join(rootPath, 'lib', 'core', 'theme', 'app_colors.dart'));
            generateThemeFiles(rootPath);
            updateMainDartForTheme(rootPath);

            if (themeAlreadyExisted) {
                vscode.window.showInformationMessage("Theme files already existed and were left unchanged; main.dart registration was refreshed.");
            } else {
                vscode.window.showInformationMessage("Successfully initialized Theme configurations (app_colors, app_text_style, app_theme) and registered them in main.dart!");
            }
        });
    });

function getKeytoolEnv(): { cmd: string; cmdPath: string; env?: any } {
    const defaultRes = { cmd: 'keytool', cmdPath: 'keytool', env: process.env };

    let jdkHome = '';
    
    if (process.platform === 'darwin') {
        const paths = [
            '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
            '/Applications/Android Studio.app/Contents/jre/Contents/Home',
            '/Applications/Android Studio.app/Contents/jre/jdk/Contents/Home'
        ];
        for (const p of paths) {
            if (fs.existsSync(path.join(p, 'bin', 'keytool'))) {
                jdkHome = p;
                break;
            }
        }
    } else if (process.platform === 'win32') {
        const paths = [
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
            path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Android', 'Android Studio', 'jre'),
            path.join(process.env.LOCALAPPDATA || '', 'Android', 'Android Studio', 'jbr'),
            path.join(process.env.LOCALAPPDATA || '', 'Android', 'Android Studio', 'jre')
        ];
        for (const p of paths) {
            const exePath = path.join(p, 'bin', 'keytool.exe');
            if (fs.existsSync(exePath)) {
                jdkHome = p;
                break;
            }
        }
    } else if (process.platform === 'linux') {
        const paths = [
            '/opt/android-studio/jbr',
            '/opt/android-studio/jre',
            path.join(process.env.HOME || '', 'android-studio', 'jbr'),
            path.join(process.env.HOME || '', 'android-studio', 'jre')
        ];
        for (const p of paths) {
            if (fs.existsSync(path.join(p, 'bin', 'keytool'))) {
                jdkHome = p;
                break;
            }
        }
    }

    if (jdkHome) {
        const binDir = path.join(jdkHome, 'bin');
        const keytoolBinary = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
        const keytoolPath = path.join(binDir, keytoolBinary);
        
        const env = { ...process.env };
        env.JAVA_HOME = jdkHome;
        env.PATH = `${binDir}${process.platform === 'win32' ? ';' : ':'}${env.PATH || ''}`;
        
        return {
            cmd: `"${keytoolPath}"`,
            cmdPath: keytoolPath,
            env
        };
    }

    return defaultRes;
}

    let generateSignedAppBundleDisposable = vscode.commands.registerCommand('flutter-config.generateSignedAppBundle', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Ask for Keystore password
        const passwordInput = await vscode.window.showInputBox({
            prompt: 'Enter password for the new upload keystore',
            placeHolder: 'e.g. android123',
            password: true,
            ignoreFocusOut: true
        });
        if (!passwordInput || passwordInput.trim().length < 6) {
            vscode.window.showErrorMessage('Password must be at least 6 characters.');
            return;
        }

        const keystorePathCheck = path.join(rootPath, 'android', 'app', 'upload-keystore.jks');
        if (fs.existsSync(keystorePathCheck)) {
            const overwriteChoice = await vscode.window.showWarningMessage(
                'An upload-keystore.jks already exists. Overwriting it will permanently invalidate the ability to publish updates to any app previously signed with it. Do you want to continue?',
                { modal: true },
                'Overwrite Keystore'
            );
            if (overwriteChoice !== 'Overwrite Keystore') {
                return;
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating Signed App Bundle...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Configuring signing properties..." });
            const configured = configureAndroidSigning(rootPath, passwordInput);
            if (!configured) return;

            progress.report({ message: "Generating Keystore file..." });
            const keystorePath = path.join(rootPath, 'android', 'app', 'upload-keystore.jks');
            if (fs.existsSync(keystorePath)) {
                fs.unlinkSync(keystorePath);
            }

            const keytoolResolution = getKeytoolEnv();
            const keytoolArgs = [
                '-genkey', '-v',
                '-keystore', 'android/app/upload-keystore.jks',
                '-keyalg', 'RSA',
                '-keysize', '2048',
                '-validity', '10000',
                '-alias', 'upload',
                '-storepass', passwordInput,
                '-keypass', passwordInput,
                '-dname', 'CN=Developer, OU=AppDev, O=Organization, L=City, S=State, C=US'
            ];
            let keytoolSuccess = true;
            let keytoolErrorMsg = '';
            await new Promise<void>((resolve) => {
                execFile(keytoolResolution.cmdPath, keytoolArgs, { cwd: rootPath, env: keytoolResolution.env }, (err, stdout, stderr) => {
                    if (err) {
                        keytoolSuccess = false;
                        keytoolErrorMsg = stderr || err.message;
                    }
                    resolve();
                });
            });

            if (!keytoolSuccess || !fs.existsSync(keystorePath)) {
                vscode.window.showErrorMessage(`Keystore generation failed: ${keytoolErrorMsg || 'Keystore file was not created. Make sure keytool is installed.'}`);
                return;
            }

            progress.report({ message: "Running flutter build appbundle..." });
            const buildCmd = `flutter build appbundle --release`;
            await new Promise<void>((resolve) => {
                exec(buildCmd, { cwd: rootPath, env: keytoolResolution.env }, (err, stdout, stderr) => {
                    if (err) {
                        vscode.window.showErrorMessage(`Build failed: ${stderr}`);
                    } else {
                        vscode.window.showInformationMessage("Successfully generated signed App Bundle (AAB) inside build/app/outputs/bundle/release/!");
                    }
                    resolve();
                });
            });
        });
    });

    let initTestsDisposable = vscode.commands.registerCommand('flutter-config.initTests', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        // Get saved configurations
        const config = vscode.workspace.getConfiguration('flutterConfig');
        let stateMgmt = config.get<string>('stateManagement');

        if (!stateMgmt) {
            // Default to BLoC if not initialized yet
            stateMgmt = await vscode.window.showQuickPick(
                STATE_MANAGEMENT_OPTIONS,
                { placeHolder: 'Select State Management Tool to configure test dependencies', ignoreFocusOut: true }
            );
            if (!stateMgmt) return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing test configurations...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Checking and adding compatible test dependencies..." });
            const testPackages = stateMgmt === 'BLoC'
                ? '"dev:integration_test@{sdk: flutter}" dev:mocktail dev:bloc_test'
                : '"dev:integration_test@{sdk: flutter}" dev:mocktail';
            const pubAddOk = await runPubAdd(testPackages, rootPath);

            progress.report({ message: "Generating unit, widget, and integration test templates..." });
            generateTestBoilerplate(rootPath, stateMgmt!);

            if (pubAddOk) {
                vscode.window.showInformationMessage("Successfully initialized Flutter Unit, Widget, and Integration tests!");
            } else {
                vscode.window.showWarningMessage("Generated test templates, but compatible test dependencies could not be added. Check your pubspec constraints and run flutter pub add manually if needed.");
            }
        });
    });

    let initCICDDisposable = vscode.commands.registerCommand('flutter-config.initCICD', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        const buildTarget = await vscode.window.showQuickPick(
            ['APK', 'App Bundle (AAB)', 'Both'],
            { placeHolder: 'Select the Android build artifact for CI', ignoreFocusOut: true }
        );
        if (!buildTarget) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing CI/CD workflow...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Generating GitHub Actions workflow..." });
            generateGitHubActionsWorkflow(rootPath, buildTarget);

            vscode.window.showInformationMessage("Successfully generated .github/workflows/flutter.yml!");
        });
    });

    let initFlavorsDisposable = vscode.commands.registerCommand('flutter-config.initFlavors', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Flutter Config: Initializing Flavors (dev/staging/prod)...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Generating flavor entrypoints and configs..." });
            generateFlavorFiles(rootPath);

            progress.report({ message: "Configuring Android product flavors..." });
            configureAndroidFlavors(rootPath);

            progress.report({ message: "Configuring iOS xcconfig scaffolding..." });
            configureIosFlavors(rootPath);

            vscode.window.showInformationMessage(
                "Successfully generated dev/staging/prod flavors! Android is fully wired. For iOS, add the generated xcconfig files as Debug-dev/Debug-staging/... configurations in Xcode (see ios/Flutter/Flavors/README.md)."
            );
        });
    });

    let initMethodChannelDisposable = vscode.commands.registerCommand('flutter-config.initMethodChannel', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        const channelInput = await vscode.window.showInputBox({
            prompt: 'Enter Method Channel name (e.g. BatteryInfo, DeviceInfo)',
            placeHolder: 'BatteryInfo',
            ignoreFocusOut: true
        });
        if (!channelInput) return;

        const methodInput = await vscode.window.showInputBox({
            prompt: 'Enter an initial native method name to call (e.g. getBatteryLevel)',
            placeHolder: 'getBatteryLevel',
            ignoreFocusOut: true
        });
        if (!methodInput) return;

        const channelSnake = toSnakeCase(channelInput);
        const channelPascal = toPascalCase(channelInput);
        const methodCamel = toCamelCase(methodInput);
        const packageName = getPackageName(rootPath);
        const channelId = `${packageName}/${channelSnake}`;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Flutter Config: Configuring ${channelPascal} Method Channel...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Generating Dart channel wrapper..." });
            generateMethodChannelDartFile(rootPath, channelSnake, channelPascal, methodCamel, channelId);

            progress.report({ message: "Wiring Android native handler..." });
            const androidWired = configureAndroidMethodChannel(rootPath, channelPascal, methodCamel, channelId);

            progress.report({ message: "Wiring iOS native handler..." });
            const iosWired = configureIosMethodChannel(rootPath, methodCamel, channelId);

            const notes: string[] = [];
            if (!androidWired) notes.push('Android MainActivity not found — wire it manually.');
            if (!iosWired) notes.push('iOS AppDelegate.swift not found — wire it manually.');

            vscode.window.showInformationMessage(
                `Successfully generated ${channelPascal} method channel ("${channelId}") with ${methodCamel}()!${notes.length ? ' ' + notes.join(' ') : ''}`
            );
        });
    });

    let initLintsDisposable = vscode.commands.registerCommand('flutter-config.initLints', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;
        const pubspecPath = path.join(rootPath, 'pubspec.yaml');
        if (!fs.existsSync(pubspecPath)) {
            vscode.window.showErrorMessage('No pubspec.yaml found. Open a Flutter project first.');
            return;
        }

        const config = vscode.workspace.getConfiguration('flutterConfig');

        const arch = await vscode.window.showQuickPick(
            ARCHITECTURE_OPTIONS,
            { placeHolder: 'Select Architecture Style for lint rules', ignoreFocusOut: true }
        );
        if (!arch) return;

        const stateMgmt = await vscode.window.showQuickPick(
            STATE_MANAGEMENT_OPTIONS,
            { placeHolder: 'Select State Management tool for lint rules', ignoreFocusOut: true }
        );
        if (!stateMgmt) return;

        await config.update('architecture', arch, vscode.ConfigurationTarget.Workspace);
        await config.update('stateManagement', stateMgmt, vscode.ConfigurationTarget.Workspace);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Flutter Config: Initializing Lint Rules...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Adding lint dependencies...' });
            configurePubspecForLints(rootPath, false);
            let pubAddOk = await runPubAdd('--dev flutter_lints', rootPath);
            if (!pubAddOk) {
                configurePubspecForLints(rootPath, false);
            }

            progress.report({ message: 'Updating analysis_options.yaml...' });
            generateAnalysisOptions(rootPath, arch!, stateMgmt!);

            if (pubAddOk || fs.readFileSync(pubspecPath, 'utf8').includes('flutter_lints:')) {
                vscode.window.showInformationMessage(
                    `Lint rules configured for ${arch} with ${stateMgmt}. Run "flutter analyze" to verify.`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Generated analysis_options.yaml for ${arch} and ${stateMgmt}, but flutter_lints could not be added. Run "flutter pub add --dev flutter_lints" manually.`
                );
            }
        });
    });

    let createPaginatedListDisposable = vscode.commands.registerCommand('flutter-config.createPaginatedList', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a Flutter workspace first.');
            return;
        }

        const rootPath = workspaceFolder.uri.fsPath;

        const featureInput = await vscode.window.showInputBox({
            prompt: 'Enter list feature name (e.g. Products, Orders, Feed)',
            placeHolder: 'Products',
            ignoreFocusOut: true
        });
        if (!featureInput) return;

        const itemModelInput = await vscode.window.showInputBox({
            prompt: 'Enter the name of a single list item (e.g. Product, Order)',
            placeHolder: 'Product',
            ignoreFocusOut: true
        });
        if (!itemModelInput) return;

        const endpoint = await vscode.window.showInputBox({
            prompt: 'Enter the paginated API endpoint (page/limit query params will be appended)',
            placeHolder: '/products',
            ignoreFocusOut: true
        });
        if (!endpoint) return;

        const inputJson = await vscode.window.showInputBox({
            prompt: `Paste a sample JSON object for a single "${toPascalCase(itemModelInput)}" item (Optional)`,
            placeHolder: '{"id": 1, "title": "Example"}',
            ignoreFocusOut: true
        });

        const itemModel = parseJsonToModel(itemModelInput, inputJson);
        const featureName = toSnakeCase(featureInput);
        const featurePascal = toPascalCase(featureInput);

        let targetDir = uri ? uri.fsPath : path.join(rootPath, 'lib', 'features');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const packageName = getPackageName(rootPath);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating paginated list for ${featurePascal}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Adding provider dependency..." });
            const pubAddOk = await runPubAdd('provider', rootPath);

            progress.report({ message: "Generating controller and page..." });
            generatePaginatedListFiles(targetDir, featureName, featurePascal, itemModel, endpoint, packageName);
            if (pubAddOk) {
                vscode.window.showInformationMessage(`Successfully generated paginated list (infinite scroll + pull-to-refresh) for ${featurePascal}!`);
            } else {
                vscode.window.showWarningMessage(`Generated paginated list files for ${featurePascal}, but 'flutter pub add provider' failed. Run it manually before building.`);
            }
        });
    });

    context.subscriptions.push(initDisposable);
    context.subscriptions.push(createScreenDisposable);
    context.subscriptions.push(createCubitDisposable);
    context.subscriptions.push(generateForExistingScreenDisposable);
    context.subscriptions.push(generateApiActionDisposable);
    context.subscriptions.push(generateLocalStateActionDisposable);
    context.subscriptions.push(initEnvDisposable);
    context.subscriptions.push(initLocalizationDisposable);
    context.subscriptions.push(initNotificationsDisposable);
    context.subscriptions.push(initConnectivityDisposable);
    context.subscriptions.push(initSecurityDisposable);
    context.subscriptions.push(initHiveDisposable);
    context.subscriptions.push(initThemeDisposable);
    context.subscriptions.push(generateSignedAppBundleDisposable);
    context.subscriptions.push(initTestsDisposable);
    context.subscriptions.push(initCICDDisposable);
    context.subscriptions.push(initFlavorsDisposable);
    context.subscriptions.push(initMethodChannelDisposable);
    context.subscriptions.push(initLintsDisposable);
    context.subscriptions.push(createPaginatedListDisposable);
}

// Quick Fix Actions Provider
class ScreenCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] | undefined {
        const fileName = document.fileName;
        if (!fileName.endsWith('.dart')) {
            return;
        }

        const actions: vscode.CodeAction[] = [];

        const base = path.basename(fileName).toLowerCase();
        if (base.includes('page') || base.includes('screen') || base.includes('view')) {
            const action = new vscode.CodeAction('Flutter Config: Generate Architecture Layers', vscode.CodeActionKind.QuickFix);
            action.command = {
                command: 'flutter-config.generateForExistingScreen',
                title: 'Generate Architecture Layers',
                arguments: [document.uri]
            };
            actions.push(action);
        }

        // Check if the current line has a widget callback like onPressed, onTap, etc.
        const line = document.lineAt(range.start.line).text;
        const callbackKeywords = [
            'onPressed', 'onTap', 'onChanged', 'onSelected', 'onPressed:', 'onTap:',
            'GestureDetector', 'InkWell', 'ElevatedButton', 'TextButton', 'IconButton',
            'Radio', 'DropdownButton'
        ];
        if (callbackKeywords.some(keyword => line.includes(keyword))) {
            const apiAction = new vscode.CodeAction('Flutter Config: Generate API Action from Callback', vscode.CodeActionKind.QuickFix);
            apiAction.command = {
                command: 'flutter-config.generateApiAction',
                title: 'Generate API Action',
                arguments: []
            };
            actions.push(apiAction);

            const localAction = new vscode.CodeAction('Flutter Config: Generate Local State Action from Callback', vscode.CodeActionKind.QuickFix);
            localAction.command = {
                command: 'flutter-config.generateLocalStateAction',
                title: 'Generate Local State Action',
                arguments: []
            };
            actions.push(localAction);
        }

        return actions;
    }
}

async function promptForModels(featurePascal: string, featureName: string, featureCamel: string): Promise<FeatureModel[]> {
    const models: FeatureModel[] = [];

    const modelMode = await vscode.window.showQuickPick(
        ['No models (Empty template)', 'Single Model / API', 'Multiple Models / APIs'],
        { placeHolder: 'Does this feature need API data models?', ignoreFocusOut: true }
    );

    if (modelMode === 'Single Model / API') {
        const mName = await vscode.window.showInputBox({
            prompt: `Enter name for the Model (default is ${featurePascal})`,
            placeHolder: featurePascal,
            ignoreFocusOut: true
        }) || featurePascal;

        const inputJson = await vscode.window.showInputBox({
            prompt: 'Paste JSON response to generate model fields automatically (Optional. Press Enter for default)',
            placeHolder: '{"id": 1, "title": "Example"}',
            ignoreFocusOut: true
        });

        models.push(parseJsonToModel(mName, inputJson));
    } else if (modelMode === 'Multiple Models / APIs') {
        let adding = true;
        let index = 1;
        while (adding) {
            const mName = await vscode.window.showInputBox({
                prompt: `Enter name for Model ${index} (or press Enter/Cancel to finish)`,
                placeHolder: `Model name (e.g. Banner, Product)`,
                ignoreFocusOut: true
            });

            if (!mName || mName.trim() === '') {
                adding = false;
                break;
            }

            const inputJson = await vscode.window.showInputBox({
                prompt: `Paste JSON response for Model "${toPascalCase(mName)}" (Optional)`,
                placeHolder: '{"id": 1}',
                ignoreFocusOut: true
            });

            models.push(parseJsonToModel(mName, inputJson));
            index++;
        }
    }

    if (models.length === 0 && modelMode !== 'No models (Empty template)') {
        models.push({
            modelName: featurePascal,
            modelNamePascal: featurePascal,
            modelNameSnake: featureName,
            modelNameCamel: featureCamel,
            properties: [
                { name: 'id', type: 'int' },
                { name: 'title', type: 'String' }
            ]
        });
    }

    return models;
}

export async function promptForHive(featurePascal: string): Promise<boolean> {
    const choice = await vscode.window.showQuickPick(
        [
            { label: 'Yes', description: `Complete Offline Feature: 100% Hive local database, full CRUD, interactive list UI, and validation for ${featurePascal}` },
            { label: 'No', description: 'Remote API only, no local offline storage' }
        ],
        {
            placeHolder: `Do you want to use Hive for offline storage & full CRUD for ${featurePascal}?`,
            ignoreFocusOut: true
        }
    );
    return choice?.label === 'Yes';
}

export function parseJsonToModel(name: string, inputJson: string | undefined): FeatureModel {
    const pascal = toPascalCase(name);
    const snake = toSnakeCase(name);
    const camel = toCamelCase(name);
    let properties: ModelProperty[] = [];
    const childModels: FeatureModel[] = [];

    if (inputJson && inputJson.trim() !== '') {
        try {
            const parsed = JSON.parse(inputJson.trim());
            if (Array.isArray(parsed)) {
                const objectItems = parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item));
                if (objectItems.length > 0) {
                    const merged = mergeObjectKeys(objectItems);
                    const result = parseObjectToModel(pascal, snake, camel, merged, name, objectItems);
                    result.isRootList = true;
                    return result;
                } else {
                    return {
                        modelName: name,
                        modelNamePascal: pascal,
                        modelNameSnake: snake,
                        modelNameCamel: camel,
                        properties: [{ name: 'items', type: 'List<dynamic>' }],
                        isRootList: true
                    };
                }
            }

            if (parsed && typeof parsed === 'object') {
                return parseObjectToModel(pascal, snake, camel, parsed, name);
            }
        } catch (e) {
            vscode.window.showWarningMessage(`Invalid JSON response for model "${pascal}". Using default fields.`);
            properties = [
                { name: 'id', type: 'int' },
                { name: 'title', type: 'String' }
            ];
        }
    } else {
        properties = [
            { name: 'id', type: 'int' },
            { name: 'title', type: 'String' }
        ];
    }

    return {
        modelName: name,
        modelNamePascal: pascal,
        modelNameSnake: snake,
        modelNameCamel: camel,
        properties: properties,
        childModels: childModels
    };
}

function mergeObjectKeys(items: any[]): Record<string, any> {
    const merged: Record<string, any> = {};
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        for (const [k, v] of Object.entries(item)) {
            if (!(k in merged) || (merged[k] === null && v !== null)) {
                merged[k] = v;
            }
        }
    }
    return merged;
}

function parseObjectToModel(
    modelPascal: string,
    modelSnake: string,
    modelCamel: string,
    obj: Record<string, any>,
    rawName: string,
    itemsToScan?: any[]
): FeatureModel {
    const properties: ModelProperty[] = [];
    const childModels: FeatureModel[] = [];
    const items = itemsToScan && itemsToScan.length > 0 ? itemsToScan : [obj];

    const allKeys: string[] = [];
    for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        for (const k of Object.keys(it)) {
            if (!allKeys.includes(k)) allKeys.push(k);
        }
    }

    for (const key of allKeys) {
        const keyPascal = toPascalCase(key);
        let observedType: string | null = null;
        let hasNull = false;
        let hasMissing = false;
        let isNestedList = false;
        let isNestedModel = false;
        let childModelPascal: string | undefined;

        const sampleObjectItems: any[] = [];
        let sampleSingleObject: any = null;

        for (const it of items) {
            if (!(key in it)) {
                hasMissing = true;
                continue;
            }
            const val = it[key];
            if (val === null || val === undefined) {
                hasNull = true;
                continue;
            }

            if (typeof val === 'number') {
                if (observedType === null) {
                    observedType = Number.isInteger(val) ? 'int' : 'double';
                }
            } else if (typeof val === 'string') {
                observedType = 'String';
            } else if (typeof val === 'boolean') {
                observedType = 'bool';
            } else if (Array.isArray(val)) {
                isNestedList = true;
                const innerObjects = val.filter((v: any) => v && typeof v === 'object' && !Array.isArray(v));
                if (innerObjects.length > 0) {
                    sampleObjectItems.push(...innerObjects);
                }
            } else if (val && typeof val === 'object') {
                isNestedModel = true;
                if (!sampleSingleObject) {
                    sampleSingleObject = val;
                }
            }
        }

        if (isNestedList) {
            if (sampleObjectItems.length > 0) {
                childModelPascal = `${modelPascal}${keyPascal}`;
                const childSnake = toSnakeCase(childModelPascal);
                const childCamel = toCamelCase(childModelPascal);
                const mergedChildObj = mergeObjectKeys(sampleObjectItems);
                const childModel = parseObjectToModel(childModelPascal, childSnake, childCamel, mergedChildObj, childModelPascal, sampleObjectItems);
                childModels.push(childModel);
                observedType = `List<${childModelPascal}Model>`;
            } else {
                observedType = 'List<dynamic>';
            }
        } else if (isNestedModel) {
            if (sampleSingleObject) {
                childModelPascal = `${modelPascal}${keyPascal}`;
                const childSnake = toSnakeCase(childModelPascal);
                const childCamel = toCamelCase(childModelPascal);
                const childModel = parseObjectToModel(childModelPascal, childSnake, childCamel, sampleSingleObject, childModelPascal);
                childModels.push(childModel);
                observedType = `${childModelPascal}Model`;
            } else {
                observedType = 'Map<String, dynamic>';
            }
        }

        if (!observedType) {
            observedType = 'dynamic';
        }

        const shouldBeNullable = (hasNull || hasMissing || (isNestedList && Boolean(childModelPascal)) || (isNestedModel && Boolean(childModelPascal))) && observedType !== 'dynamic';
        const finalType = shouldBeNullable ? `${observedType}?` : observedType;

        properties.push({
            name: key,
            type: finalType,
            isNestedList: isNestedList && Boolean(childModelPascal),
            isNestedModel: isNestedModel && Boolean(childModelPascal),
            childModelPascal: childModelPascal
        });
    }

    const hasId = properties.some(p => /^(id|_id|uuid)$/i.test(p.name) || /id$/i.test(p.name));
    if (!hasId && properties.length > 0) {
        properties.unshift({
            name: 'id',
            type: 'String?',
            isNestedList: false,
            isNestedModel: false
        });
    }

    return {
        modelName: rawName,
        modelNamePascal: modelPascal,
        modelNameSnake: modelSnake,
        modelNameCamel: modelCamel,
        properties: properties,
        childModels: childModels
    };
}

export function getPackageName(rootPath: string): string {
    let packageName = 'flutter_project';
    try {
        const pubspecPath = path.join(rootPath, 'pubspec.yaml');
        if (fs.existsSync(pubspecPath)) {
            const content = fs.readFileSync(pubspecPath, 'utf8');
            const match = content.match(/^name:\s*([a-zA-Z0-9_\-]+)/m);
            if (match) {
                packageName = match[1].trim();
            }
        }
    } catch (_) {}
    return packageName;
}

export function findProjectRoot(startDir: string): string {
    let current = startDir;
    while (true) {
        if (fs.existsSync(path.join(current, 'pubspec.yaml'))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return startDir;
}

export function isInjectableEnabled(rootPath: string): boolean {
    try {
        const pubspecPath = path.join(rootPath, 'pubspec.yaml');
        if (fs.existsSync(pubspecPath)) {
            const content = fs.readFileSync(pubspecPath, 'utf8');
            return /^\s*injectable\s*:/m.test(content);
        }
    } catch (_) {}
    return false;
}

// Convert helpers
function isPubAddDryRunCompatible(stdout: string, stderr: string): boolean {
    const output = `${stdout}\n${stderr}`;
    if (/version solving failed/i.test(output)) return false;
    if (/is incompatible with/i.test(output)) return false;
    if (/because .* depends on/i.test(output) && /so, because/i.test(output)) return false;

    return /Would change \d+ dependenc/i.test(output) ||
        /Changed \d+ dependenc/i.test(output) ||
        /No dependencies changed/i.test(output);
}

function getExistingPubspecDependencyNames(rootPath: string): Set<string> {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    const dependencies = new Set<string>();
    if (!fs.existsSync(pubspecPath)) return dependencies;

    const content = fs.readFileSync(pubspecPath, 'utf8');
    for (const match of content.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)) {
        dependencies.add(match[1]);
    }

    return dependencies;
}

function packageNameFromPubAddToken(token: string): string {
    const withoutSection = token.replace(/^(dev|override):/, '');
    return withoutSection.split('@')[0].trim();
}

function tokenizePubAddArgs(packagesArg: string): string[] {
    const tokens: string[] = [];
    const tokenPattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(packagesArg)) !== null) {
        tokens.push(match[1] || match[2] || match[3]);
    }

    return tokens;
}

function quotePubAddToken(token: string): string {
    if (!/\s/.test(token)) return token;
    return `"${token.replace(/"/g, '\\"')}"`;
}

function filterAlreadyAddedPackages(packagesArg: string, rootPath: string): string {
    const existingDependencies = getExistingPubspecDependencyNames(rootPath);
    const tokens = tokenizePubAddArgs(packagesArg);
    const normalPackages: string[] = [];
    const devSectionPackages: string[] = [];
    const devPrefixedPackages: string[] = [];
    let devMode = false;

    for (const token of tokens) {
        if (token === '--dev') {
            devMode = true;
            continue;
        }

        if (token.startsWith('-')) continue;

        const packageName = packageNameFromPubAddToken(token);
        if (!packageName || existingDependencies.has(packageName)) continue;

        if (devMode || token.startsWith('dev:')) {
            if (token.startsWith('dev:')) {
                devPrefixedPackages.push(token);
            } else {
                devSectionPackages.push(token);
            }
        } else {
            normalPackages.push(token);
        }
    }

    return [
        ...normalPackages.map(quotePubAddToken),
        ...devPrefixedPackages.map(quotePubAddToken),
        ...(devSectionPackages.length ? ['--dev', ...devSectionPackages.map(quotePubAddToken)] : []),
    ].join(' ');
}

export function getExtendedEnv(): NodeJS.ProcessEnv {
    const currentPath = process.env.PATH || '';
    const home = process.env.HOME || '';
    const additionalPaths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        path.join(home, 'flutter', 'bin'),
        path.join(home, 'fvm', 'default', 'bin'),
        path.join(home, '.pub-cache', 'bin'),
        path.join(home, 'development', 'flutter', 'bin'),
    ].filter(p => p && !currentPath.split(path.delimiter).includes(p));

    const newPath = additionalPaths.length > 0 
        ? `${additionalPaths.join(path.delimiter)}${path.delimiter}${currentPath}`
        : currentPath;

    return {
        ...process.env,
        PATH: newPath,
    };
}

function runFlutterPubAdd(packagesArg: string, rootPath: string, dryRun: boolean): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
        const dryRunFlag = dryRun ? '--dry-run ' : '';
        exec(`flutter pub add ${dryRunFlag}--no-example ${packagesArg}`, { cwd: rootPath, env: getExtendedEnv() }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout,
                stderr: stderr || (err ? err.message : ''),
            });
        });
    });
}

async function runPubAdd(packagesArg: string, rootPath: string): Promise<boolean> {
    const filteredPackagesArg = filterAlreadyAddedPackages(packagesArg, rootPath);
    if (!filteredPackagesArg) return true;

    const dryRun = await runFlutterPubAdd(filteredPackagesArg, rootPath, true);
    if (!dryRun.ok && !isPubAddDryRunCompatible(dryRun.stdout, dryRun.stderr)) {
        console.error(`Pub add compatibility check failed for "${filteredPackagesArg}": ${dryRun.stderr || dryRun.stdout}`);
        return false;
    }

    const actual = await runFlutterPubAdd(filteredPackagesArg, rootPath, false);
    if (!actual.ok) {
        console.error(`Pub add failed for "${filteredPackagesArg}": ${actual.stderr || actual.stdout}`);
        return false;
    }

    return true;
}

export function toSnakeCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}

export function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toCamelCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
        .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function buildActionCallSnippet(
    stateMgmt: string,
    arch: string,
    featureCamel: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string
): string {
    const isClean = arch.includes('Clean');
    const isMvc = arch.includes('MVC');
    if (stateMgmt === 'BLoC') {
        if (isClean) {
            return `context.read<${featurePascal}Bloc>().add(Execute${actionPascal}Event());`;
        } else if (isMvc) {
            return `context.read<${featurePascal}Controller>().${actionCamel}();`;
        } else {
            return `context.read<${featurePascal}ViewModel>().${actionCamel}();`;
        }
    } else if (stateMgmt === 'Provider') {
        if (isClean) {
            return `context.read<${featurePascal}Notifier>().${actionCamel}();`;
        } else if (isMvc) {
            return `context.read<${featurePascal}Controller>().${actionCamel}();`;
        } else {
            return `context.read<${featurePascal}ViewModel>().${actionCamel}();`;
        }
    } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
        return isClean || isMvc
            ? `controller.${actionCamel}();`
            : `viewModel.${actionCamel}();`;
    } else {
        if (isClean) {
            return `ref.read(${featureCamel}NotifierProvider.notifier).${actionCamel}();`;
        } else if (isMvc) {
            return `ref.read(${featureCamel}ControllerProvider.notifier).${actionCamel}();`;
        } else {
            return `ref.read(${featureCamel}ViewModelProvider.notifier).${actionCamel}();`;
        }
    }
}

async function installDependencies(rootPath: string, stateManagement: string): Promise<boolean> {
    return new Promise((resolve) => {
        const pkgs = [
            'dio',
            'get_it',
            'freezed_annotation',
            'json_annotation',
            'flutter_screenutil',
            'go_router'
        ];

        if (stateManagement === 'BLoC') {
            pkgs.push('flutter_bloc');
        } else if (stateManagement === 'PureBind') {
            pkgs.push('purebind');
        } else if (stateManagement === 'GetX') {
            pkgs.push('get');
        } else if (stateManagement === 'Provider') {
            pkgs.push('provider');
        } else {
            pkgs.push('flutter_riverpod');
            pkgs.push('riverpod_annotation');
        }

        const devPkgs = [
            'build_runner',
            'freezed',
            'json_serializable'
        ];

        if (stateManagement === 'Riverpod') {
            devPkgs.push('riverpod_generator');
        }

        const packagesArg = `${pkgs.join(' ')} --dev ${devPkgs.join(' ')}`;
        runPubAdd(packagesArg, rootPath).then(resolve);
    });
}

export function generateCoreConfig(rootPath: string, stateMgmt?: string) {
    ensureBuildYamlForExplicitToJson(rootPath);
    const diDir = path.join(rootPath, 'lib', 'core', 'di');
    const networkDir = path.join(rootPath, 'lib', 'core', 'network');
    const routerDir = path.join(rootPath, 'lib', 'core', 'router');

    fs.mkdirSync(diDir, { recursive: true });
    fs.mkdirSync(networkDir, { recursive: true });
    fs.mkdirSync(routerDir, { recursive: true });

    if (stateMgmt === 'Provider') {
        const providersDir = path.join(rootPath, 'lib', 'core', 'providers');
        const providersPath = path.join(providersDir, 'providers.dart');
        if (!fs.existsSync(providersPath)) {
            fs.mkdirSync(providersDir, { recursive: true });
            const defaultTemplate = `// ignore_for_file: unused_import
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

List<SingleChildWidget> getProviders() => [
];
`;
            fs.writeFileSync(providersPath, defaultTemplate);
        }
    }

    // 1. Token Service Config
    const tokenServicePath = path.join(networkDir, 'token_service.dart');
    if (!fs.existsSync(tokenServicePath)) {
        const tokenServiceTemplate = `class TokenService {
  static final TokenService _instance = TokenService._internal();
  factory TokenService() => _instance;
  TokenService._internal();

  String? _accessToken = "your_initial_access_token_here";
  String? _refreshToken = "your_initial_refresh_token_here";

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;

  Future<void> updateTokens(String access, String refresh) async {
    _accessToken = access;
    _refreshToken = refresh;
  }

  Future<String?> refreshTokenApi() async {
    // TODO: Implement actual API call to refresh token using the refresh token.
    _accessToken = "new_refreshed_access_token_\${DateTime.now().millisecondsSinceEpoch}";
    return _accessToken;
  }
}
`;
        fs.writeFileSync(tokenServicePath, tokenServiceTemplate);
    }

    // 1. Dio Config
    const dioPath = path.join(networkDir, 'dio_configuration.dart');
    const legacyDioPath = path.join(rootPath, 'lib', 'core', 'dio_configuration.dart');
    if (fs.existsSync(legacyDioPath)) {
        if (!fs.existsSync(dioPath)) {
            fs.copyFileSync(legacyDioPath, dioPath);
        }
        fs.rmSync(legacyDioPath, { force: true });
    }

    if (!fs.existsSync(dioPath)) {
        const useInjectable = isInjectableEnabled(rootPath);
        const injectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const moduleAnnotation = useInjectable ? "@module\n" : "";
        const classDeclaration = useInjectable ? "abstract class DioModule" : "class DioModule";
        const lazySingletonAnnotation = useInjectable ? "  @lazySingleton\n" : "";

        const dioTemplate = `import 'package:dio/dio.dart';
${injectableImport}import 'token_service.dart';

${moduleAnnotation}${classDeclaration} {
${lazySingletonAnnotation}  Dio get dio {
    final dio = Dio(
      BaseOptions(
        baseUrl: 'https://api.yourdomain.com/v1/',
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      ),
    );

    dio.interceptors.add(
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = TokenService().accessToken;
          if (token != null) {
            options.headers['Authorization'] = 'Bearer \$token';
          }
          return handler.next(options);
        },
        onError: (DioException e, handler) async {
          if (e.response?.statusCode == 401) {
            try {
              final newAccessToken = await TokenService().refreshTokenApi();
              if (newAccessToken != null) {
                // Retry request with new token
                final options = e.requestOptions;
                options.headers['Authorization'] = 'Bearer \$newAccessToken';
                
                final response = await dio.fetch(options);
                return handler.resolve(response);
              }
            } catch (err) {
              return handler.next(e);
            }
          }
          return handler.next(e);
        },
      ),
    );

    return dio;
  }
}
`;
        fs.writeFileSync(dioPath, dioTemplate);
    }

    // 1b. Dio Extensions for Push, Put, Delete, Get
    const dioExtPath = path.join(networkDir, 'dio_extensions.dart');
    const legacyDioExtPath = path.join(rootPath, 'lib', 'core', 'dio_extensions.dart');
    if (fs.existsSync(legacyDioExtPath)) {
        if (!fs.existsSync(dioExtPath)) {
            fs.copyFileSync(legacyDioExtPath, dioExtPath);
        }
        fs.rmSync(legacyDioExtPath, { force: true });
    }

    // Clean up legacy locator files if present
    const legacyLocatorPath = path.join(rootPath, 'lib', 'locator.dart');
    const legacyLocatorConfigPath = path.join(rootPath, 'lib', 'locator.config.dart');
    if (fs.existsSync(legacyLocatorPath)) {
        fs.rmSync(legacyLocatorPath, { force: true });
    }
    if (fs.existsSync(legacyLocatorConfigPath)) {
        fs.rmSync(legacyLocatorConfigPath, { force: true });
    }

    if (!fs.existsSync(dioExtPath)) {
        const dioExtTemplate = `import 'package:dio/dio.dart';

extension DioExtensions on Dio {
  Future<Response<T>> getRequest<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await get<T>(path, queryParameters: queryParameters, options: options, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<Response<T>> postRequest<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await post<T>(path, data: data, queryParameters: queryParameters, options: options, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<Response<T>> putRequest<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await put<T>(path, data: data, queryParameters: queryParameters, options: options, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<Response<T>> patchRequest<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await patch<T>(path, data: data, queryParameters: queryParameters, options: options, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<Response<T>> deleteRequest<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    try {
      return await delete<T>(path, data: data, queryParameters: queryParameters, options: options, cancelToken: cancelToken);
    } on DioException catch (e) {
      throw Exception(e.message);
    }
  }
}
`;
            fs.writeFileSync(dioExtPath, dioExtTemplate);
        }

    // 2. Simple DI Setup
    const diPath = path.join(diDir, 'injection.dart');
    if (!fs.existsSync(diPath)) {
        const useInjectable = isInjectableEnabled(rootPath);
        let diTemplate = '';
        if (useInjectable) {
            diTemplate = `import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';
import 'injection.config.dart';

final getIt = GetIt.instance;

@InjectableInit()
void configureDependencies() => getIt.init();
`;
        } else {
            diTemplate = `import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';
import '../network/dio_configuration.dart';

final getIt = GetIt.instance;

void configureDependencies() {
  // Core
  getIt.registerLazySingleton<Dio>(() => DioModule().dio);
  
  // Features register tag (DO NOT REMOVE)
}
`;
        }
        fs.writeFileSync(diPath, diTemplate);
    }

    // 3. GoRouter Setup
    const routerPath = path.join(routerDir, 'app_router.dart');
    if (!fs.existsSync(routerPath)) {
        const routerTemplate = `import 'package:go_router/go_router.dart';
import 'package:flutter/material.dart';

final GoRouter appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const Scaffold(
        body: Center(child: Text('Home (Flutter Config)')),
      ),
    ),
    // Routes register tag (DO NOT REMOVE)
  ],
);
`;
        fs.writeFileSync(routerPath, routerTemplate);
    }
}

export function updateMainDartForRouterAndScreenUtil(rootPath: string, stateMgmt?: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    const isRiverpod = stateMgmt === 'Riverpod';

    const mainTemplate = `${isRiverpod ? "import 'package:flutter_riverpod/flutter_riverpod.dart';\n" : ""}import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'core/di/injection.dart';
import 'core/router/app_router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  configureDependencies();
  runApp(${isRiverpod ? "const ProviderScope(child: MyApp())" : "const MyApp()"});
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ScreenUtilInit(
      designSize: const Size(375, 812),
      minTextAdapt: true,
      splitScreenMode: true,
      builder: (context, child) {
        return MaterialApp.router(
          routerConfig: appRouter,
          title: 'Flutter Config App',
          debugShowCheckedModeBanner: false,
        );
      },
    );
  }
}
`;
    let finalMainContent = mainTemplate;
    if (stateMgmt === 'Provider') {
        finalMainContent = "import 'package:provider/provider.dart';\nimport 'core/providers/providers.dart';\n" + finalMainContent;
        finalMainContent = finalMainContent.replace(
            /runApp\(([\s\S]*?)\);/,
            'runApp(\n    MultiProvider(\n      providers: getProviders(),\n      child: $1,\n    ),\n  );'
        );
    }
    fs.writeFileSync(mainPath, finalMainContent);

    // Re-apply any previously initialized integrations so running "Init Architecture"
    // after Env/Localization/Notifications/Theme doesn't wipe them out.
    if (fs.existsSync(path.join(rootPath, '.env'))) {
        updateMainDartForEnv(rootPath);
    }
    if (fs.existsSync(path.join(rootPath, 'l10n.yaml'))) {
        updateMainDartForLocalization(rootPath);
    }
    if (fs.existsSync(path.join(rootPath, 'lib', 'core', 'services', 'notification_service.dart'))) {
        updateMainDartForNotifications(rootPath);
    }
    if (fs.existsSync(path.join(rootPath, 'lib', 'core', 'theme', 'app_theme.dart'))) {
        updateMainDartForTheme(rootPath);
    }
}

export function findDiFilePath(rootPath: string): string {
    const candidates = [
        path.join(rootPath, 'lib', 'core', 'di', 'injection.dart'),
        path.join(rootPath, 'lib', 'core', 'di', 'locator.dart'),
        path.join(rootPath, 'lib', 'core', 'locator.dart'),
        path.join(rootPath, 'lib', 'core', 'injection.dart'),
        path.join(rootPath, 'lib', 'injection.dart'),
        path.join(rootPath, 'lib', 'locator.dart'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
}

export function registerProviderInProvidersList(
    rootPath: string,
    name: string,
    pascal: string,
    packageName: string,
    arch: string,
    models: FeatureModel[] = []
) {
    registerDependenciesInLocator(rootPath, name, pascal, packageName, arch, 'Provider', models);

    const providersDir = path.join(rootPath, 'lib', 'core', 'providers');
    const providersPath = path.join(providersDir, 'providers.dart');
    if (!fs.existsSync(providersPath)) {
        fs.mkdirSync(providersDir, { recursive: true });
        const defaultTemplate = `// ignore_for_file: unused_import
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

List<SingleChildWidget> getProviders() => [
];
`;
        fs.writeFileSync(providersPath, defaultTemplate);
    }

    let content = fs.readFileSync(providersPath, 'utf8');
    const importPath = `import 'package:${packageName}/features/${name}/presentation/provider/${name}_notifier.dart';`;
    const className = `${pascal}Notifier`;
    const diFile = findDiFilePath(rootPath);
    const relDiPath = path.relative(path.join(rootPath, 'lib'), diFile).replace(/\\/g, '/');
    const diImport = `import 'package:${packageName}/${relDiPath}';`;

    let importsToAdd = '';
    if (!content.includes(importPath)) {
        importsToAdd += `${importPath}\n`;
    }
    if (!content.includes(diImport)) {
        importsToAdd += `${diImport}\n`;
    }

    const providerEntry = `  ChangeNotifierProvider<${className}>(create: (_) => getIt<${className}>()),`;

    // Self-heal direct instantiation in providers.dart if present
    content = content.replace(
        new RegExp(`ChangeNotifierProvider<${className}>\\s*\\(\\s*create:\\s*\\(_\\)\\s*=>\\s*${className}\\(\\)\\s*\\)`, 'g'),
        `ChangeNotifierProvider<${className}>(create: (_) => getIt<${className}>())`
    );
    content = content.replace(
        new RegExp(`create:\\s*\\(_\\)\\s*=>\\s*${className}\\(\\)`, 'g'),
        `create: (_) => getIt<${className}>()`
    );

    if (!content.includes(`ChangeNotifierProvider<${className}>`)) {
        const listRegex = /(List<SingleChildWidget>\s+getProviders\s*\(\s*\)\s*=>\s*\[)([\s\S]*?)(\];)/;
        if (listRegex.test(content)) {
            content = content.replace(listRegex, `$1\n${providerEntry}$2$3`);
        } else if (content.includes('getProviders() => [')) {
            const bracketIdx = content.indexOf('getProviders() => [') + 'getProviders() => ['.length;
            content = content.slice(0, bracketIdx) + '\n' + providerEntry + content.slice(bracketIdx);
        }
    }

    if (importsToAdd) {
        content = importsToAdd + content;
    }

    fs.writeFileSync(providersPath, content);
}

export function registerRouteInGoRouter(
    rootPath: string,
    name: string,
    pascal: string,
    packageName: string,
    arch: string,
    stateMgmt?: string
) {
    const routerPath = path.join(rootPath, 'lib', 'core', 'router', 'app_router.dart');
    if (!fs.existsSync(routerPath)) return;

    let content = fs.readFileSync(routerPath, 'utf8');

    let importPath = '';
    let pageClass = '';

    if (arch.includes('Clean')) {
        importPath = `import 'package:${packageName}/features/${name}/presentation/pages/${name}_page.dart';`;
        pageClass = `${pascal}Page`;
    } else {
        importPath = `import 'package:${packageName}/features/${name}/views/${name}_view.dart';`;
        pageClass = `${pascal}View`;
    }

    // Insert import if not already present
    if (!content.includes(importPath)) {
        content = `${importPath}\n${content}`;
    }

    // PureBind/GetX pages hold a getIt<...> field initializer, so their constructor isn't const.
    const supportsConst = stateMgmt !== 'PureBind' && stateMgmt !== 'GetX';

    // Insert GoRoute registration if not already present (using PageClass.route)
    const routeDecl = `GoRoute(
      path: ${pageClass}.route,
      builder: (context, state) => ${supportsConst ? 'const ' : ''}${pageClass}(),
    ),`;

    if (!content.includes(`path: ${pageClass}.route`)) {
        const tag = '// Routes register tag (DO NOT REMOVE)';
        content = content.replace(tag, routeDecl + '\n    ' + tag);
    }

    if (content.includes("initialLocation: '/'")) {
        content = content.replace("initialLocation: '/'", `initialLocation: ${pageClass}.route`);
    }

    fs.writeFileSync(routerPath, content);
}

export function registerDependenciesInLocator(
    rootPath: string, 
    name: string, 
    pascal: string, 
    packageName: string,
    arch: string,
    stateMgmt: string,
    models: FeatureModel[],
    useHive = false
) {
    const diPath = path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
    if (!fs.existsSync(diPath)) return;

    let content = fs.readFileSync(diPath, 'utf8');

    // If configureDependencies was written as arrow function (e.g. with Injectable), convert to block
    if (content.includes('void configureDependencies() => getIt.init();')) {
        content = content.replace(
            'void configureDependencies() => getIt.init();',
            'void configureDependencies() {\n  getIt.init();\n  // Features register tag (DO NOT REMOVE)\n}'
        );
    }

    // Self-healing: fix corrupted comment-swallowed registrations
    content = content.replace(/\/\/\s*([A-Za-z0-9_]+)\s+Feature\s+(getIt\.)/g, '// $1 Feature\n  $2');
    // Self-healing: fix double semicolons
    content = content.replace(/;\s*;/g, ';');

    let imports = '';
    let registrations = '';

    if (!content.includes('package:dio/dio.dart')) {
        imports += "import 'package:dio/dio.dart';\n";
    }

    const discoveredUsecases: { name: string; pascal: string; camel: string; importLine: string }[] = [];
    const usecasesDir = path.join(rootPath, 'lib', 'features', name, 'domain', 'usecases');
    if (fs.existsSync(usecasesDir)) {
        const files = fs.readdirSync(usecasesDir).filter(f => f.endsWith('_usecase.dart'));
        for (const f of files) {
            const base = f.replace(/\.dart$/, '');
            const normalized = base.replace(/_usecase$/, '_use_case');
            const ucPascal = toPascalCase(normalized);
            const ucCamel = toCamelCase(normalized);
            const importLine = `import 'package:${packageName}/features/${name}/domain/usecases/${f}';\n`;
            discoveredUsecases.push({ name: base, pascal: ucPascal, camel: ucCamel, importLine });
        }
    }

    let allUsecaseArgs = models.map(m => `get${m.modelNamePascal}UseCase: getIt<Get${m.modelNamePascal}UseCase>(),\n      create${m.modelNamePascal}UseCase: getIt<Create${m.modelNamePascal}UseCase>(),\n      update${m.modelNamePascal}UseCase: getIt<Update${m.modelNamePascal}UseCase>(),\n      patch${m.modelNamePascal}UseCase: getIt<Patch${m.modelNamePascal}UseCase>(),\n      delete${m.modelNamePascal}UseCase: getIt<Delete${m.modelNamePascal}UseCase>()`).join(',\n      ');
    if (!allUsecaseArgs && discoveredUsecases.length > 0) {
        allUsecaseArgs = discoveredUsecases.map(u => `${u.camel}: getIt<${u.pascal}>()`).join(',\n      ');
        for (const u of discoveredUsecases) {
            if (!content.includes(`getIt.registerLazySingleton<${u.pascal}>`)) {
                imports += u.importLine;
                registrations += `  getIt.registerLazySingleton<${u.pascal}>(\n    () => ${u.pascal}(getIt()),\n  );\n`;
            }
        }
    }

    // Self-healing: update empty constructor if usecases were discovered
    if (discoveredUsecases.length > 0) {
        const discoveredArgs = discoveredUsecases.map(u => `${u.camel}: getIt<${u.pascal}>()`).join(',\n      ');
        const emptyConstructorRegex = new RegExp(`\\(\\)\\s*=>\\s*(${pascal}(?:Notifier|Bloc|Controller))\\s*\\(\\s*\\)`, 'g');
        if (emptyConstructorRegex.test(content)) {
            content = content.replace(emptyConstructorRegex, `() => $1(\n      ${discoveredArgs},\n    )`);
            for (const u of discoveredUsecases) {
                if (!content.includes(u.importLine.trim())) {
                    imports += u.importLine;
                }
            }
        }
    }

    if (arch.includes('Clean')) {
        for (const m of models) {
            const hasLocalDs = useHive || fs.existsSync(path.join(rootPath, 'lib', 'features', name, 'data', 'datasources', `${m.modelNameSnake}_local_data_source.dart`));
            const remoteDataSourceCheck = `getIt.registerLazySingleton<${m.modelNamePascal}RemoteDataSource>`;
            if (!content.includes(remoteDataSourceCheck)) {
                if (hasLocalDs) {
                    if (!content.includes('core/services/hive_service.dart') && !imports.includes('core/services/hive_service.dart')) {
                        imports += `import 'package:${packageName}/core/services/hive_service.dart';\n`;
                        registrations += `  if (!getIt.isRegistered<HiveService>()) {\n    getIt.registerLazySingleton<HiveService>(() => HiveService());\n  }\n`;
                    }
                    imports += `import 'package:${packageName}/features/${name}/data/datasources/${m.modelNameSnake}_local_data_source.dart';\n`;
                }
                imports += `import 'package:${packageName}/features/${name}/data/datasources/${m.modelNameSnake}_remote_data_source.dart';
import 'package:${packageName}/features/${name}/data/repositories/${m.modelNameSnake}_repository_impl.dart';
import 'package:${packageName}/features/${name}/domain/repositories/${m.modelNameSnake}_repository.dart';
import 'package:${packageName}/features/${name}/domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/patch_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/delete_${m.modelNameSnake}_usecase.dart';
`;
                const repoRegistration = hasLocalDs
                    ? `  getIt.registerLazySingleton<${m.modelNamePascal}LocalDataSource>(
    () => ${m.modelNamePascal}LocalDataSourceImpl(getIt<HiveService>()),
  );
  getIt.registerLazySingleton<${m.modelNamePascal}Repository>(
    () => ${m.modelNamePascal}RepositoryImpl(
      getIt<${m.modelNamePascal}RemoteDataSource>(),
      getIt<${m.modelNamePascal}LocalDataSource>(),
    ),
  );`
                    : `  getIt.registerLazySingleton<${m.modelNamePascal}Repository>(
    () => ${m.modelNamePascal}RepositoryImpl(getIt<${m.modelNamePascal}RemoteDataSource>()),
  );`;

                registrations += `
  getIt.registerLazySingleton<${m.modelNamePascal}RemoteDataSource>(
    () => ${m.modelNamePascal}RemoteDataSourceImpl(getIt<Dio>()),
  );
${repoRegistration}
  getIt.registerLazySingleton<Get${m.modelNamePascal}UseCase>(
    () => Get${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Create${m.modelNamePascal}UseCase>(
    () => Create${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Update${m.modelNamePascal}UseCase>(
    () => Update${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Patch${m.modelNamePascal}UseCase>(
    () => Patch${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Delete${m.modelNamePascal}UseCase>(
    () => Delete${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
`;
            }
        }

        if (stateMgmt === 'BLoC') {
            const blocCheck = `getIt.registerFactory<${pascal}Bloc>`;
            if (!content.includes(blocCheck)) {
                imports += `import 'package:${packageName}/features/${name}/presentation/bloc/${name}_bloc.dart';\n`;
                const argsBlock = allUsecaseArgs ? `\n      ${allUsecaseArgs},\n    ` : '';
                registrations += `  getIt.registerFactory<${pascal}Bloc>(
    () => ${pascal}Bloc(${argsBlock}),
  );\n`;
            }
        } else if (stateMgmt === 'PureBind') {
            const controllerCheck = `getIt.registerFactory<${pascal}Controller>`;
            if (!content.includes(controllerCheck)) {
                imports += `import 'package:${packageName}/features/${name}/presentation/controllers/${name}_controller.dart';\n`;
                const argsBlock = allUsecaseArgs ? `\n      ${allUsecaseArgs},\n    ` : '';
                registrations += `  getIt.registerFactory<${pascal}Controller>(
    () => ${pascal}Controller(${argsBlock}),
  );\n`;
            }
        } else if (stateMgmt === 'GetX') {
            const controllerCheck = `getIt.registerFactory<${pascal}Controller>`;
            if (!content.includes(controllerCheck)) {
                imports += `import 'package:${packageName}/features/${name}/presentation/controllers/${name}_controller.dart';\n`;
                const argsBlock = allUsecaseArgs ? `\n      ${allUsecaseArgs},\n    ` : '';
                registrations += `  getIt.registerFactory<${pascal}Controller>(
    () => ${pascal}Controller(${argsBlock}),
  );\n`;
            }
        } else if (stateMgmt === 'Provider') {
            const notifierCheck = `getIt.registerFactory<${pascal}Notifier>`;
            if (!content.includes(notifierCheck)) {
                imports += `import 'package:${packageName}/features/${name}/presentation/provider/${name}_notifier.dart';\n`;
                const argsBlock = allUsecaseArgs ? `\n      ${allUsecaseArgs},\n    ` : '';
                registrations += `  getIt.registerFactory<${pascal}Notifier>(
    () => ${pascal}Notifier(${argsBlock}),
  );\n`;
            }
        }
    } else if (arch.includes('MVC')) {
        for (const m of models) {
            const hasLocalService = useHive || fs.existsSync(path.join(rootPath, 'lib', 'features', name, 'services', `${m.modelNameSnake}_local_service.dart`));
            const modelImportCheck = `import 'package:${packageName}/features/${name}/models/${m.modelNameSnake}_model.dart';`;
            if (!content.includes(modelImportCheck)) {
                imports += `${modelImportCheck}\n`;
            }
            const serviceImportCheck = `import 'package:${packageName}/features/${name}/services/${m.modelNameSnake}_api_service.dart';`;
            if (!content.includes(serviceImportCheck)) {
                imports += `${serviceImportCheck}\n`;
            }

            const serviceCheck = `getIt.registerLazySingleton<${m.modelNamePascal}ApiService>`;
            if (!content.includes(serviceCheck)) {
                registrations += `
  getIt.registerLazySingleton<${m.modelNamePascal}ApiService>(
    () => ${m.modelNamePascal}ApiServiceImpl(getIt<Dio>()),
  );\n`;
            }

            if (hasLocalService) {
                if (!content.includes('core/services/hive_service.dart') && !imports.includes('core/services/hive_service.dart')) {
                    imports += `import 'package:${packageName}/core/services/hive_service.dart';\n`;
                    registrations += `  if (!getIt.isRegistered<HiveService>()) {\n    getIt.registerLazySingleton<HiveService>(() => HiveService());\n  }\n`;
                }
                const localImportCheck = `import 'package:${packageName}/features/${name}/services/${m.modelNameSnake}_local_service.dart';`;
                if (!content.includes(localImportCheck)) {
                    imports += `${localImportCheck}\n`;
                }
                const localCheck = `getIt.registerLazySingleton<${m.modelNamePascal}LocalService>`;
                if (!content.includes(localCheck)) {
                    registrations += `  getIt.registerLazySingleton<${m.modelNamePascal}LocalService>(
    () => ${m.modelNamePascal}LocalServiceImpl(getIt<HiveService>()),
  );\n`;
                }
            }
        }

        if (stateMgmt !== 'Riverpod') {
            const ctrlCheck = `getIt.registerFactory<${pascal}Controller>`;
            if (!content.includes(ctrlCheck)) {
                imports += `import 'package:${packageName}/features/${name}/controllers/${name}_controller.dart';\n`;
                const serviceArgs = models.map(m => `getIt<${m.modelNamePascal}ApiService>()`).join(', ');
                registrations += `
  getIt.registerFactory<${pascal}Controller>(
    () => ${pascal}Controller(${serviceArgs}),
  );\n`;
            }
        }
    } else {
        // MVVM
        for (const m of models) {
            const hasLocalService = useHive || fs.existsSync(path.join(rootPath, 'lib', 'features', name, 'services', `${m.modelNameSnake}_local_service.dart`));
            const modelImportCheck = `import 'package:${packageName}/features/${name}/models/${m.modelNameSnake}_model.dart';`;
            if (!content.includes(modelImportCheck)) {
                imports += `${modelImportCheck}\n`;
            }
            const serviceImportCheck = `import 'package:${packageName}/features/${name}/services/${m.modelNameSnake}_api_service.dart';`;
            if (!content.includes(serviceImportCheck)) {
                imports += `${serviceImportCheck}\n`;
            }

            const serviceCheck = `getIt.registerLazySingleton<${m.modelNamePascal}ApiService>`;
            if (!content.includes(serviceCheck)) {
                registrations += `
  getIt.registerLazySingleton<${m.modelNamePascal}ApiService>(
    () => ${m.modelNamePascal}ApiServiceImpl(getIt<Dio>()),
  );\n`;
            }

            if (hasLocalService) {
                if (!content.includes('core/services/hive_service.dart') && !imports.includes('core/services/hive_service.dart')) {
                    imports += `import 'package:${packageName}/core/services/hive_service.dart';\n`;
                    registrations += `  if (!getIt.isRegistered<HiveService>()) {\n    getIt.registerLazySingleton<HiveService>(() => HiveService());\n  }\n`;
                }
                const localImportCheck = `import 'package:${packageName}/features/${name}/services/${m.modelNameSnake}_local_service.dart';`;
                if (!content.includes(localImportCheck)) {
                    imports += `${localImportCheck}\n`;
                }
                const localCheck = `getIt.registerLazySingleton<${m.modelNamePascal}LocalService>`;
                if (!content.includes(localCheck)) {
                    registrations += `  getIt.registerLazySingleton<${m.modelNamePascal}LocalService>(
    () => ${m.modelNamePascal}LocalServiceImpl(getIt<HiveService>()),
  );\n`;
                }
            }
        }

        if (stateMgmt !== 'Riverpod') {
            const vmCheck = `getIt.registerFactory<${pascal}ViewModel>`;
            if (!content.includes(vmCheck)) {
                imports += `import 'package:${packageName}/features/${name}/viewmodels/${name}_viewmodel.dart';\n`;
                const serviceArgs = models.map(m => `getIt<${m.modelNamePascal}ApiService>()`).join(', ');
                registrations += `
  getIt.registerFactory<${pascal}ViewModel>(
    () => ${pascal}ViewModel(${serviceArgs}),
  );\n`;
            }
        }
    }

    // Filter duplicate import lines
    const importLines = imports.split('\n');
    let finalImports = '';
    for (const line of importLines) {
        if (line.trim() !== '' && !content.includes(line)) {
            finalImports += line + '\n';
        }
    }

    content = finalImports + content;

    // Append registrations right before tag
    if (registrations.trim() !== '') {
        const tag = '// Features register tag (DO NOT REMOVE)';
        content = content.replace(tag, `\n  // ${pascal} Feature\n` + registrations + '  ' + tag);
    }

    fs.writeFileSync(diPath, content);
}

function renderEntityClass(model: FeatureModel): string {
    const entityPropertiesDecl = model.properties.map(p => {
        const propType = p.type.replace(/Model\b/g, 'Entity');
        return `  final ${propType} ${p.name};`;
    }).join('\n');
    const entityConstructorDecl = model.properties.map(p => {
        const isNullable = p.type.endsWith('?');
        return isNullable ? `    this.${p.name},` : `    required this.${p.name},`;
    }).join('\n');

    const copyWithParams = model.properties.map(p => {
        const propType = p.type.replace(/Model\b/g, 'Entity');
        const cleanType = propType.endsWith('?') ? propType : `${propType}?`;
        return `    ${cleanType} ${p.name},`;
    }).join('\n');
    const copyWithBody = model.properties.map(p => `      ${p.name}: ${p.name} ?? this.${p.name},`).join('\n');

    const statusProp = model.properties.find(p => /^(status|state)$/i.test(p.name));
    const boolDoneProp = model.properties.find(p => /^(is_?completed|is_?done|completed|done)$/i.test(p.name));
    let statusGetter = '';
    if (statusProp) {
        statusGetter = `\n  bool get isCompleted => ${statusProp.name}?.toString().toLowerCase() == 'completed';\n`;
    } else if (boolDoneProp) {
        statusGetter = `\n  bool get isCompleted => ${boolDoneProp.name} == true;\n`;
    } else {
        statusGetter = `\n  bool get isCompleted => false;\n`;
    }

    let result = `class ${model.modelNamePascal}Entity {
${entityPropertiesDecl}

  const ${model.modelNamePascal}Entity({
${entityConstructorDecl}
  });

  ${model.modelNamePascal}Entity copyWith({
${copyWithParams}
  }) {
    return ${model.modelNamePascal}Entity(
${copyWithBody}
    );
  }
${statusGetter}}
`;
    if (model.childModels && model.childModels.length > 0) {
        for (const child of model.childModels) {
            result += '\n' + renderEntityClass(child);
        }
    }
    return result;
}

function renderFreezedCleanArchModelClass(model: FeatureModel): string {
    const modelPropertiesDecl = model.properties.map(p => {
        const camelName = toCamelCase(p.name);
        const isNullable = p.type.endsWith('?');
        const reqPrefix = isNullable ? '' : 'required ';
        if (camelName !== p.name) {
            return `    @JsonKey(name: '${p.name}') ${reqPrefix}${p.type} ${camelName},`;
        }
        return `    ${reqPrefix}${p.type} ${p.name},`;
    }).join('\n');
    const modelToEntityMapper = model.properties.map(p => {
        const camelName = toCamelCase(p.name);
        if (p.isNestedList) {
            return `      ${p.name}: ${camelName}?.map((e) => e.toEntity()).toList(),`;
        }
        if (p.isNestedModel) {
            return `      ${p.name}: ${camelName}?.toEntity(),`;
        }
        return `      ${p.name}: ${camelName},`;
    }).join('\n');
    const modelFromEntityMapper = model.properties.map(p => {
        const camelName = toCamelCase(p.name);
        const childName = p.childModelPascal || (p.type.includes('Model') ? p.type.replace(/^List<([a-zA-Z0-9_]+)Model(\?)?>.*$/, '$1').replace(/Model(\?)?$/, '') : undefined);
        if (p.isNestedList && childName) {
            return `    ${camelName}: entity.${p.name}?.map((e) => ${childName}Model.fromEntity(e)).toList(),`;
        }
        if (p.isNestedModel && childName) {
            return `    ${camelName}: entity.${p.name} != null ? ${childName}Model.fromEntity(entity.${p.name}!) : null,`;
        }
        return `    ${camelName}: entity.${p.name},`;
    }).join('\n');

    let result = `@freezed
abstract class ${model.modelNamePascal}Model with _\$${model.modelNamePascal}Model {
  @JsonSerializable(explicitToJson: true)
  const factory ${model.modelNamePascal}Model({
${modelPropertiesDecl}
  }) = _${model.modelNamePascal}Model;

  factory ${model.modelNamePascal}Model.fromJson(Map<String, dynamic> json) => _\$${model.modelNamePascal}ModelFromJson(json);

  factory ${model.modelNamePascal}Model.fromEntity(${model.modelNamePascal}Entity entity) => ${model.modelNamePascal}Model(
${modelFromEntityMapper}
  );

  const ${model.modelNamePascal}Model._();

  ${model.modelNamePascal}Entity toEntity() => ${model.modelNamePascal}Entity(
${modelToEntityMapper}
  );
}

extension ${model.modelNamePascal}EntityToModel on ${model.modelNamePascal}Entity {
  ${model.modelNamePascal}Model toModel() => ${model.modelNamePascal}Model.fromEntity(this);
}
`;
    if (model.childModels && model.childModels.length > 0) {
        for (const child of model.childModels) {
            result += '\n' + renderFreezedCleanArchModelClass(child);
        }
    }
    return result;
}

function renderHiveOfflineCleanArchPage(name: string, pascal: string, model: FeatureModel, packageName: string): string {
    const idProp = model.properties.find(p => /^(id|_id|uuid)$/i.test(p.name)) 
                || model.properties.find(p => /id$/i.test(p.name)) 
                || model.properties[0];
    const idField = idProp ? idProp.name : 'id';
    const idType = idProp ? idProp.type.replace('?', '').trim() : 'String';

    const titleProp = model.properties.find(p => p.name !== idField && /^(task_title|title|name|taskTitle|heading|label)$/i.test(p.name)) 
                   || model.properties.find(p => p.name !== idField && p.type.includes('String')) 
                   || model.properties.find(p => p.name !== idField) 
                   || model.properties[0];
    const descProp = model.properties.find(p => p.name !== idField && p.name !== titleProp?.name && /^(description|desc|details|note|notes|body|summary)$/i.test(p.name));
    const dateProp = model.properties.find(p => p.name !== idField && /date/i.test(p.name));
    const priorityProp = model.properties.find(p => p.name !== idField && /priority|level/i.test(p.name));
    const statusProp = model.properties.find(p => p.name !== idField && /status|state/i.test(p.name));
    const boolDoneProp = model.properties.find(p => p.name !== idField && /^(is_?completed|is_?done|completed|done)$/i.test(p.name));

    const titleField = titleProp ? titleProp.name : idField;
    const descField = descProp ? descProp.name : '';
    const dateField = dateProp ? dateProp.name : '';
    const priorityField = priorityProp ? priorityProp.name : '';
    const statusField = statusProp ? statusProp.name : '';

    const knownFieldNames = new Set([idField, titleField, descField, dateField, priorityField, statusField].filter(Boolean));
    const otherProps = model.properties.filter(p => !knownFieldNames.has(p.name) && !p.isNestedList && !p.isNestedModel);

    return `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../../domain/entities/${model.modelNameSnake}_entity.dart';
import '../bloc/${name}_bloc.dart';

class ${pascal}Page extends StatelessWidget {
  static const route = '/${name}';
  const ${pascal}Page({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => getIt<${pascal}Bloc>()..add(Load${pascal}ListEvent()),
      child: const ${pascal}View(),
    );
  }
}

class ${pascal}View extends StatefulWidget {
  const ${pascal}View({super.key});

  @override
  State<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends State<${pascal}View> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showFormDialog(BuildContext context, {${model.modelNamePascal}Entity? existingItem}) {
    final formKey = GlobalKey<FormState>();
    final titleController = TextEditingController(text: existingItem?.${titleField}?.toString() ?? '');
    ${descField ? `final descController = TextEditingController(text: existingItem?.${descField}?.toString() ?? '');` : ''}
    ${dateField ? `String selectedDate = existingItem?.${dateField}?.toString() ?? '';` : ''}
    ${priorityField ? `String selectedPriority = existingItem?.${priorityField}?.toString() ?? 'Medium';` : ''}
    ${statusField ? `String selectedStatus = existingItem?.${statusField}?.toString() ?? 'Pending';` : ''}
    ${otherProps.map(p => {
      if (p.type.replace('?', '') === 'bool') {
        return `bool ${p.name}Value = existingItem?.${p.name} ?? false;`;
      } else {
        return `final ${p.name}Controller = TextEditingController(text: existingItem?.${p.name}?.toString() ?? '');`;
      }
    }).join('\n    ')}

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (bottomSheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(bottomSheetContext).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            existingItem == null ? 'Add New ${pascal}' : 'Edit ${pascal}',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(bottomSheetContext),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: titleController,
                        decoration: const InputDecoration(
                          labelText: 'Title *',
                          hintText: 'Enter title...',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.title),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Title is mandatory';
                          }
                          return null;
                        },
                      ),
                      ${descField ? `const SizedBox(height: 14),
                      TextFormField(
                        controller: descController,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Description (Optional)',
                          hintText: 'Add description...',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.description_outlined),
                        ),
                      ),` : ''}
                      ${dateField ? `const SizedBox(height: 14),
                      InkWell(
                        onTap: () async {
                          final now = DateTime.now();
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: now,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2035),
                          );
                          if (picked != null) {
                            final formatted =
                                '\${picked.year.toString().padLeft(4, '0')}-\${picked.month.toString().padLeft(2, '0')}-\${picked.day.toString().padLeft(2, '0')}';
                            setModalState(() {
                              selectedDate = formatted;
                            });
                          }
                        },
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Date *',
                            border: const OutlineInputBorder(),
                            prefixIcon: const Icon(Icons.calendar_today_outlined),
                            errorText: selectedDate.isEmpty ? 'Date is mandatory' : null,
                          ),
                          child: Text(
                            selectedDate.isEmpty ? 'Tap to select date' : selectedDate,
                            style: TextStyle(
                              color: selectedDate.isEmpty
                                  ? Theme.of(context).hintColor
                                  : Theme.of(context).textTheme.bodyMedium?.color,
                            ),
                          ),
                        ),
                      ),` : ''}
                      ${(priorityField || statusField) ? `const SizedBox(height: 14),
                      Row(
                        children: [
                          ${priorityField ? `Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedPriority,
                              decoration: const InputDecoration(
                                labelText: 'Priority',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.flag_outlined),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'Low', child: Text('Low')),
                                DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                                DropdownMenuItem(value: 'High', child: Text('High')),
                              ],
                              onChanged: (val) {
                                if (val != null) {
                                  setModalState(() => selectedPriority = val);
                                }
                              },
                            ),
                          ),` : ''}
                          ${(priorityField && statusField) ? `const SizedBox(width: 12),` : ''}
                          ${statusField ? `Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedStatus,
                              decoration: const InputDecoration(
                                labelText: 'Status',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.check_circle_outline),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'Pending', child: Text('Pending')),
                                DropdownMenuItem(value: 'Completed', child: Text('Completed')),
                              ],
                              onChanged: (val) {
                                if (val != null) {
                                  setModalState(() => selectedStatus = val);
                                }
                              },
                            ),
                          ),` : ''}
                        ],
                      ),` : ''}
                      ${otherProps.map(p => {
                        const label = toPascalCase(p.name);
                        if (p.type.replace('?', '') === 'bool') {
                          return `const SizedBox(height: 10),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('${label}'),
                        value: ${p.name}Value,
                        onChanged: (val) {
                          setModalState(() => ${p.name}Value = val);
                        },
                      ),`;
                        } else if (p.type.replace('?', '') === 'int' || p.type.replace('?', '') === 'double') {
                          return `const SizedBox(height: 14),
                      TextFormField(
                        controller: ${p.name}Controller,
                        keyboardType: const TextInputType.numberWithOptions(decimal: ${p.type.includes('double')}),
                        decoration: const InputDecoration(
                          labelText: '${label}',
                          border: OutlineInputBorder(),
                        ),
                      ),`;
                        } else {
                          return `const SizedBox(height: 14),
                      TextFormField(
                        controller: ${p.name}Controller,
                        decoration: const InputDecoration(
                          labelText: '${label}',
                          border: OutlineInputBorder(),
                        ),
                      ),`;
                        }
                      }).join('\n                      ')}
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton.icon(
                          icon: Icon(existingItem == null ? Icons.add : Icons.save),
                          label: Text(existingItem == null ? 'Create ${pascal}' : 'Save Changes'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).colorScheme.primary,
                            foregroundColor: Theme.of(context).colorScheme.onPrimary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: () {
                            if (!formKey.currentState!.validate()) return;
                            ${dateField ? `if (selectedDate.isEmpty) { setModalState(() {}); return; }` : ''}

                            final bloc = context.read<${pascal}Bloc>();
                            if (existingItem == null) {
                              final newItem = ${model.modelNamePascal}Entity(
                                ${model.properties.map(p => {
                                  if (p.name === idField) {
                                      if (idType === 'int') return `${p.name}: DateTime.now().millisecondsSinceEpoch,`;
                                      if (idType === 'double') return `${p.name}: DateTime.now().millisecondsSinceEpoch.toDouble(),`;
                                      return `${p.name}: DateTime.now().millisecondsSinceEpoch.toString(),`;
                                  }
                                  if (p.name === titleField) return `${p.name}: titleController.text.trim(),`;
                                  if (descField && p.name === descField) return `${p.name}: descController.text.trim(),`;
                                  if (dateField && p.name === dateField) return `${p.name}: selectedDate,`;
                                  if (priorityField && p.name === priorityField) return `${p.name}: selectedPriority,`;
                                  if (statusField && p.name === statusField) return `${p.name}: selectedStatus,`;
                                  if (/create/i.test(p.name)) return `${p.name}: DateTime.now().toIso8601String(),`;
                                  if (p.type.replace('?', '') === 'bool') return `${p.name}: ${p.name}Value,`;
                                  if (p.type.replace('?', '') === 'int') return `${p.name}: int.tryParse(${p.name}Controller.text.trim()) ?? 0,`;
                                  if (p.type.replace('?', '') === 'double') return `${p.name}: double.tryParse(${p.name}Controller.text.trim()) ?? 0.0,`;
                                  if (p.type.replace('?', '') === 'String') return `${p.name}: ${p.name}Controller.text.trim(),`;
                                  if (p.type.endsWith('?')) return `${p.name}: null,`;
                                  return `${p.name}: '',`;
                                }).join('\n                                ')}
                              );
                              bloc.add(Add${pascal}Event(newItem));
                            } else {
                              final updated = existingItem.copyWith(
                                ${titleField}: titleController.text.trim(),
                                ${descField ? `${descField}: descController.text.trim(),` : ''}
                                ${dateField ? `${dateField}: selectedDate,` : ''}
                                ${priorityField ? `${priorityField}: selectedPriority,` : ''}
                                ${statusField ? `${statusField}: selectedStatus,` : ''}
                                ${otherProps.map(p => {
                                  if (p.type.replace('?', '') === 'bool') return `${p.name}: ${p.name}Value,`;
                                  if (p.type.replace('?', '') === 'int') return `${p.name}: int.tryParse(${p.name}Controller.text.trim()) ?? existingItem.${p.name},`;
                                  if (p.type.replace('?', '') === 'double') return `${p.name}: double.tryParse(${p.name}Controller.text.trim()) ?? existingItem.${p.name},`;
                                  if (p.type.replace('?', '') === 'String') return `${p.name}: ${p.name}Controller.text.trim(),`;
                                  return '';
                                }).filter(Boolean).join('\n                                ')}
                              );
                              bloc.add(Update${pascal}Event(updated));
                            }

                            Navigator.pop(bottomSheetContext);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  existingItem == null ? '${pascal} created!' : '${pascal} updated!',
                                ),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red.shade700;
      case 'medium':
        return Colors.amber.shade800;
      case 'low':
      default:
        return Colors.green.shade700;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('${pascal} Manager', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            Row(
              children: [
                Icon(Icons.cloud_off, size: 14, color: theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 4),
                Text(
                  'Hive Local Storage (100% Offline)',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showFormDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('Add ${pascal}'),
      ),
      body: BlocConsumer<${pascal}Bloc, ${pascal}State>(
        listener: (context, state) {
          if (state is ${pascal}Error) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: Colors.red),
            );
          }
        },
        builder: (context, state) {
          if (state is ${pascal}Loading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is ${pascal}Loaded) {
            return Column(
              children: [
                // Search Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search ${name}...',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                context.read<${pascal}Bloc>().add(Filter${pascal}Event(searchQuery: ''));
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (query) {
                      context.read<${pascal}Bloc>().add(Filter${pascal}Event(searchQuery: query));
                    },
                  ),
                ),

                ${(statusField || priorityField) ? `// Filters Section
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ${statusField ? `Row(
                        children: [
                          const Text('Status: ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(width: 6),
                          Wrap(
                            spacing: 6,
                            children: ['All', 'Pending', 'Completed'].map((status) {
                              final isSelected = state.statusFilter.toLowerCase() == status.toLowerCase();
                              return ChoiceChip(
                                label: Text(status),
                                selected: isSelected,
                                onSelected: (sel) {
                                  if (sel) {
                                    context.read<${pascal}Bloc>().add(Filter${pascal}Event(statusFilter: status));
                                  }
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),` : ''}
                      ${priorityField ? `Row(
                        children: [
                          const Text('Priority: ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(width: 6),
                          Wrap(
                            spacing: 6,
                            children: ['All', 'Low', 'Medium', 'High'].map((prio) {
                              final isSelected = state.priorityFilter.toLowerCase() == prio.toLowerCase();
                              return ChoiceChip(
                                label: Text(prio),
                                selected: isSelected,
                                onSelected: (sel) {
                                  if (sel) {
                                    context.read<${pascal}Bloc>().add(Filter${pascal}Event(priorityFilter: prio));
                                  }
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ),` : ''}
                    ],
                  ),
                ),
                const Divider(),` : ''}

                // List or Empty State
                Expanded(
                  child: state.filteredItems.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.inbox_outlined,
                                size: 64,
                                color: theme.colorScheme.outline,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                state.allItems.isEmpty
                                    ? 'No ${name} yet!'
                                    : 'No items match current filter',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                state.allItems.isEmpty
                                    ? 'Tap the + button to create a new offline item.'
                                    : 'Try resetting the filters or search.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.outline,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: state.filteredItems.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final item = state.filteredItems[index];
                            final isCompleted = item.isCompleted;

                            return Dismissible(
                              key: Key(item.${idField}?.toString() ?? UniqueKey().toString()),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 20),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade600,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.delete, color: Colors.white),
                              ),
                              confirmDismiss: (_) async {
                                return await showDialog<bool>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                    title: const Text('Delete ${pascal}'),
                                    content: Text('Are you sure you want to delete this ${name}?'),
                                    actions: [
                                      TextButton(
                                        onPressed: () => Navigator.pop(ctx, false),
                                        child: const Text('Cancel'),
                                      ),
                                      TextButton(
                                        onPressed: () => Navigator.pop(ctx, true),
                                        style: TextButton.styleFrom(foregroundColor: Colors.red),
                                        child: const Text('Delete'),
                                      ),
                                    ],
                                  ),
                                );
                              },
                              onDismissed: (_) {
                                context.read<${pascal}Bloc>().add(Delete${pascal}Event(item.${idField}));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Item deleted'),
                                    duration: Duration(seconds: 2),
                                  ),
                                );
                              },
                              child: Card(
                                elevation: isCompleted ? 0 : 2,
                                color: isCompleted
                                    ? theme.colorScheme.surfaceContainerLow
                                    : theme.colorScheme.surface,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(
                                    color: isCompleted
                                        ? theme.colorScheme.outlineVariant
                                        : Colors.transparent,
                                  ),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(12),
                                  onTap: () => _showFormDialog(context, existingItem: item),
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        ${(statusField || boolDoneProp) ? `IconButton(
                                          icon: Icon(
                                            isCompleted
                                                ? Icons.check_circle
                                                : Icons.radio_button_unchecked,
                                            color: isCompleted
                                                ? Colors.green.shade600
                                                : theme.colorScheme.outline,
                                          ),
                                          onPressed: () {
                                            context.read<${pascal}Bloc>().add(Toggle${pascal}StatusEvent(item));
                                          },
                                        ),
                                        const SizedBox(width: 4),` : ''}

                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                item.${titleField}?.toString() ?? '',
                                                style: theme.textTheme.titleMedium?.copyWith(
                                                  fontWeight: FontWeight.bold,
                                                  decoration: isCompleted
                                                      ? TextDecoration.lineThrough
                                                      : TextDecoration.none,
                                                  color: isCompleted
                                                      ? theme.colorScheme.outline
                                                      : theme.colorScheme.onSurface,
                                                ),
                                              ),
                                              ${descField ? `if ((item.${descField}?.toString() ?? '').isNotEmpty) ...[
                                                const SizedBox(height: 4),
                                                Text(
                                                  item.${descField}!.toString(),
                                                  maxLines: 2,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: theme.textTheme.bodyMedium?.copyWith(
                                                    color: isCompleted
                                                        ? theme.colorScheme.outline
                                                        : theme.colorScheme.onSurfaceVariant,
                                                  ),
                                                ),
                                              ],` : ''}
                                              const SizedBox(height: 8),

                                              Wrap(
                                                spacing: 8,
                                                runSpacing: 4,
                                                children: [
                                                  ${dateField ? `Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: theme.colorScheme.surfaceContainerHighest,
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: Row(
                                                      mainAxisSize: MainAxisSize.min,
                                                      children: [
                                                        Icon(Icons.calendar_today,
                                                            size: 12,
                                                            color: theme.colorScheme.onSurfaceVariant),
                                                        const SizedBox(width: 4),
                                                        Text(
                                                          'Date: \${item.${dateField}}',
                                                          style: theme.textTheme.labelSmall?.copyWith(
                                                            color: theme.colorScheme.onSurfaceVariant,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),` : ''}

                                                  ${priorityField ? `Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: _getPriorityColor(item.${priorityField}?.toString() ?? '')
                                                          .withValues(alpha: 0.15),
                                                      borderRadius: BorderRadius.circular(6),
                                                      border: Border.all(
                                                        color: _getPriorityColor(item.${priorityField}?.toString() ?? ''),
                                                        width: 1,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      item.${priorityField}?.toString() ?? '',
                                                      style: theme.textTheme.labelSmall?.copyWith(
                                                        color: _getPriorityColor(item.${priorityField}?.toString() ?? ''),
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),` : ''}

                                                  ${statusField ? `Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: isCompleted
                                                          ? Colors.green.withValues(alpha: 0.15)
                                                          : Colors.blue.withValues(alpha: 0.15),
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: Text(
                                                      item.${statusField}?.toString() ?? '',
                                                      style: theme.textTheme.labelSmall?.copyWith(
                                                        color: isCompleted
                                                            ? Colors.green.shade700
                                                            : Colors.blue.shade700,
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),` : ''}
                                                   ${otherProps.filter(p => !p.type.includes('bool') && !p.isNestedList && !p.isNestedModel).map(p => `Container(
                                                     padding: const EdgeInsets.symmetric(
                                                         horizontal: 8, vertical: 3),
                                                     decoration: BoxDecoration(
                                                       color: theme.colorScheme.surfaceContainerHighest,
                                                       borderRadius: BorderRadius.circular(6),
                                                     ),
                                                     child: Text(
                                                       '${toPascalCase(p.name)}: \${item.${p.name}}',
                                                       style: theme.textTheme.labelSmall?.copyWith(
                                                         color: theme.colorScheme.onSurfaceVariant,
                                                       ),
                                                     ),
                                                   ),`).join('\n                                                   ')}
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),

                                        PopupMenuButton<String>(
                                          icon: const Icon(Icons.more_vert, size: 20),
                                          onSelected: (val) {
                                            if (val == 'edit') {
                                              _showFormDialog(context, existingItem: item);
                                            } else if (val == 'toggle') {
                                              context.read<${pascal}Bloc>().add(Toggle${pascal}StatusEvent(item));
                                            } else if (val == 'delete') {
                                              context.read<${pascal}Bloc>().add(Delete${pascal}Event(item.${idField}));
                                            }
                                          },
                                          itemBuilder: (ctx) => [
                                            PopupMenuItem(
                                              value: 'edit',
                                              child: Row(
                                                children: const [
                                                  Icon(Icons.edit_outlined, size: 18),
                                                  SizedBox(width: 8),
                                                  Text('Edit'),
                                                ],
                                              ),
                                            ),
                                            ${(statusField || boolDoneProp) ? `PopupMenuItem(
                                              value: 'toggle',
                                              child: Row(
                                                children: [
                                                  Icon(
                                                    isCompleted
                                                        ? Icons.replay
                                                        : Icons.check_circle_outline,
                                                    size: 18,
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Text(isCompleted
                                                      ? 'Mark as Pending'
                                                      : 'Mark as Completed'),
                                                ],
                                              ),
                                            ),` : ''}
                                            const PopupMenuDivider(),
                                            PopupMenuItem(
                                              value: 'delete',
                                              child: Row(
                                                children: const [
                                                  Icon(Icons.delete_outline, color: Colors.red, size: 18),
                                                  SizedBox(width: 8),
                                                  Text('Delete', style: TextStyle(color: Colors.red)),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          }

          return const SizedBox();
        },
      ),
    );
  }
}
`;
}

export function generateCleanArchFiles(
    targetDir: string, 
    name: string, 
    pascal: string, 
    camel: string, 
    stateMgmt: string, 
    models: FeatureModel[],
    packageName: string,
    skipPageIfExists = false,
    useHive = false
) {
    const featDir = path.join(targetDir, name);
    const dataDir = path.join(featDir, 'data');
    const domainDir = path.join(featDir, 'domain');
    const presDir = path.join(featDir, 'presentation');

    // Create folders
    fs.mkdirSync(path.join(dataDir, 'datasources'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'models'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'repositories'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'entities'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'repositories'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'usecases'), { recursive: true });
    
    if (stateMgmt === 'BLoC') {
        fs.mkdirSync(path.join(presDir, 'bloc'), { recursive: true });
    } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
        fs.mkdirSync(path.join(presDir, 'controllers'), { recursive: true });
    } else if (stateMgmt === 'Provider') {
        fs.mkdirSync(path.join(presDir, 'provider'), { recursive: true });
    } else {
        fs.mkdirSync(path.join(presDir, 'riverpod'), { recursive: true });
    }
    fs.mkdirSync(path.join(presDir, 'pages'), { recursive: true });

    // Generate files for each model
    for (const m of models) {
        // 1. Entity
        fs.writeFileSync(
            path.join(domainDir, 'entities', `${m.modelNameSnake}_entity.dart`),
            `${renderEntityClass(m)}
`
        );

        // 2. Repository Contract
        fs.writeFileSync(
            path.join(domainDir, 'repositories', `${m.modelNameSnake}_repository.dart`),
            `import '../entities/${m.modelNameSnake}_entity.dart';

abstract class ${m.modelNamePascal}Repository {
  Future<${m.modelNamePascal}Entity> get${m.modelNamePascal}Data();
  Future<List<${m.modelNamePascal}Entity>> get${m.modelNamePascal}List();
  Future<${m.modelNamePascal}Entity> create${m.modelNamePascal}(${m.modelNamePascal}Entity entity);
  Future<${m.modelNamePascal}Entity> update${m.modelNamePascal}(${m.modelNamePascal}Entity entity);
  Future<${m.modelNamePascal}Entity> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data);
  Future<void> delete${m.modelNamePascal}(dynamic id);
}
`
        );

        // 3a. Get Usecase
        const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
        const injectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const lazySingletonAnnot = useInjectable ? "@lazySingleton\n" : "";

        fs.writeFileSync(
            path.join(domainDir, 'usecases', `get_${m.modelNameSnake}_usecase.dart`),
            `${injectableImport}import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

${lazySingletonAnnot}class Get${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Get${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute() {
    return repository.get${m.modelNamePascal}Data();
  }

  Future<List<${m.modelNamePascal}Entity>> executeList() {
    return repository.get${m.modelNamePascal}List();
  }
}
`
        );

        // 3b. Create Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `create_${m.modelNameSnake}_usecase.dart`),
            `${injectableImport}import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

${lazySingletonAnnot}class Create${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Create${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute(${m.modelNamePascal}Entity entity) {
    return repository.create${m.modelNamePascal}(entity);
  }
}
`
        );

        // 3c. Update Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `update_${m.modelNameSnake}_usecase.dart`),
            `${injectableImport}import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

${lazySingletonAnnot}class Update${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Update${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute(${m.modelNamePascal}Entity entity) {
    return repository.update${m.modelNamePascal}(entity);
  }
}
`
        );

        // 3d. Patch Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `patch_${m.modelNameSnake}_usecase.dart`),
            `${injectableImport}import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

${lazySingletonAnnot}class Patch${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Patch${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute(dynamic id, Map<String, dynamic> data) {
    return repository.patch${m.modelNamePascal}(id, data);
  }
}
`
        );

        // 3e. Delete Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `delete_${m.modelNameSnake}_usecase.dart`),
            `${injectableImport}import '../repositories/${m.modelNameSnake}_repository.dart';

${lazySingletonAnnot}class Delete${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Delete${m.modelNamePascal}UseCase(this.repository);

  Future<void> execute(dynamic id) {
    return repository.delete${m.modelNamePascal}(id);
  }
}
`
        );

        // 4. Model (Freezed)
        fs.writeFileSync(
            path.join(dataDir, 'models', `${m.modelNameSnake}_model.dart`),
            `import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/entities/${m.modelNameSnake}_entity.dart';

part '${m.modelNameSnake}_model.freezed.dart';
part '${m.modelNameSnake}_model.g.dart';

${renderFreezedCleanArchModelClass(m)}
`
        );

        // 5. Data Source
        const dsInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const dsInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}RemoteDataSource)\n` : "";

        fs.writeFileSync(
            path.join(dataDir, 'datasources', `${m.modelNameSnake}_remote_data_source.dart`),
            `${dsInjectableImport}import 'package:dio/dio.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}RemoteDataSource {
  Future<${m.modelNamePascal}Model> fetch${m.modelNamePascal}Data();
  Future<${m.modelNamePascal}Model> create${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model> update${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data);
  Future<void> delete${m.modelNamePascal}(dynamic id);
}

${dsInjectableAnnot}class ${m.modelNamePascal}RemoteDataSourceImpl implements ${m.modelNamePascal}RemoteDataSource {
  final Dio dio;

  ${m.modelNamePascal}RemoteDataSourceImpl(this.dio);

  @override
  Future<${m.modelNamePascal}Model> fetch${m.modelNamePascal}Data() async {
    try {
      final response = await dio.getRequest('/${m.modelNameSnake}');
      return ${m.modelNamePascal}Model.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to fetch ${m.modelNameSnake}: \$e");
    }
  }

  @override
  Future<${m.modelNamePascal}Model> create${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.postRequest('/${m.modelNameSnake}', data: model.toJson());
      return ${m.modelNamePascal}Model.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to create ${m.modelNameSnake}: \$e");
    }
  }

  @override
  Future<${m.modelNamePascal}Model> update${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.putRequest('/${m.modelNameSnake}', data: model.toJson());
      return ${m.modelNamePascal}Model.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to update ${m.modelNameSnake}: \$e");
    }
  }

  @override
  Future<${m.modelNamePascal}Model> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data) async {
    try {
      final response = await dio.patchRequest('/${m.modelNameSnake}/\$id', data: data);
      return ${m.modelNamePascal}Model.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to patch ${m.modelNameSnake}: \$e");
    }
  }

  @override
  Future<void> delete${m.modelNamePascal}(dynamic id) async {
    try {
      await dio.deleteRequest('/${m.modelNameSnake}/\$id');
    } catch (e) {
      throw Exception("Failed to delete ${m.modelNameSnake}: \$e");
    }
  }
}
`
        );

        if (useHive) {
            const localDsInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const localDsInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}LocalDataSource)\n` : "";
            const mIdProp = m.properties.find(p => /^(id|_id|uuid)$/i.test(p.name)) || m.properties.find(p => /id$/i.test(p.name));
            const localKeyAccessor = (mIdProp && mIdProp.name !== 'id') ? `(model as dynamic).${mIdProp.name}?.toString() ?? ` : '';

            fs.writeFileSync(
                path.join(dataDir, 'datasources', `${m.modelNameSnake}_local_data_source.dart`),
                `${localDsInjectableImport}import 'dart:convert';
import 'package:${packageName}/core/services/hive_service.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}LocalDataSource {
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}();
  Future<List<${m.modelNamePascal}Model>> getAll();
  Future<${m.modelNamePascal}Model?> getById(dynamic id);
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<void> save(${m.modelNamePascal}Model model);
  Future<void> update(${m.modelNamePascal}Model model);
  Future<void> delete(dynamic id);
  Future<void> clear();
  Future<void> clearCache();
}

${localDsInjectableAnnot}class ${m.modelNamePascal}LocalDataSourceImpl implements ${m.modelNamePascal}LocalDataSource {
  final HiveService hiveService;
  static const String boxName = '${m.modelNameSnake}_box';
  static const String cacheKey = 'cached_${m.modelNameSnake}';

  ${m.modelNamePascal}LocalDataSourceImpl([HiveService? hiveService])
      : hiveService = hiveService ?? HiveService();

  @override
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}() async {
    final box = await hiveService.openBox(boxName);
    final rawData = box.get(cacheKey);
    if (rawData != null) {
      final json = jsonDecode(jsonEncode(rawData)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    final all = await getAll();
    if (all.isNotEmpty) return all.first;
    return null;
  }

  @override
  Future<List<${m.modelNamePascal}Model>> getAll() async {
    final box = await hiveService.openBox(boxName);
    final items = <${m.modelNamePascal}Model>[];
    for (final key in box.keys) {
      if (key == cacheKey) continue;
      final raw = box.get(key);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    if (items.isEmpty && box.containsKey(cacheKey)) {
      final raw = box.get(cacheKey);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    return items;
  }

  @override
  Future<${m.modelNamePascal}Model?> getById(dynamic id) async {
    final box = await hiveService.openBox(boxName);
    final raw = box.get(id.toString());
    if (raw != null) {
      final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    return null;
  }

  @override
  Future<void> save(${m.modelNamePascal}Model model) async {
    final rawJson = jsonDecode(jsonEncode(model.toJson()));
    final key = ${localKeyAccessor}(model as dynamic).id?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString();
    await hiveService.put(key, rawJson, boxName: boxName);
    await hiveService.put(cacheKey, rawJson, boxName: boxName);
  }

  @override
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> update(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> delete(dynamic id) async {
    await hiveService.delete(id.toString(), boxName: boxName);
  }

  @override
  Future<void> clearCache() async {
    await hiveService.delete(cacheKey, boxName: boxName);
  }

  @override
  Future<void> clear() async {
    await hiveService.clear(boxName: boxName);
  }
}
`
            );
        }

        // 6. Repository Impl
        const repoInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const repoInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}Repository)\n` : "";
        const repoLocalImport = useHive ? `import '../datasources/${m.modelNameSnake}_local_data_source.dart';\n` : '';
        const repoFields = useHive
            ? `  final ${m.modelNamePascal}RemoteDataSource remoteDataSource;\n  final ${m.modelNamePascal}LocalDataSource localDataSource;\n\n  ${m.modelNamePascal}RepositoryImpl(this.remoteDataSource, this.localDataSource);`
            : `  final ${m.modelNamePascal}RemoteDataSource remoteDataSource;\n\n  ${m.modelNamePascal}RepositoryImpl(this.remoteDataSource);`;

        const getListMethodBody = useHive
            ? `  @override
  Future<List<${m.modelNamePascal}Entity>> get${m.modelNamePascal}List() async {
    final models = await localDataSource.getAll();
    if (models.isNotEmpty) {
      return models.map((m) => m.toEntity()).toList();
    }
    try {
      final remote = await remoteDataSource.fetch${m.modelNamePascal}Data();
      await localDataSource.save(remote);
      return [remote.toEntity()];
    } catch (_) {
      return [];
    }
  }`
            : `  @override
  Future<List<${m.modelNamePascal}Entity>> get${m.modelNamePascal}List() async {
    try {
      final remote = await remoteDataSource.fetch${m.modelNamePascal}Data();
      return [remote.toEntity()];
    } catch (_) {
      return [];
    }
  }`;

        const getMethodBody = useHive
            ? `  @override
  Future<${m.modelNamePascal}Entity> get${m.modelNamePascal}Data() async {
    try {
      final model = await remoteDataSource.fetch${m.modelNamePascal}Data();
      await localDataSource.cache${m.modelNamePascal}(model);
      return model.toEntity();
    } catch (_) {
      final cached = await localDataSource.getLast${m.modelNamePascal}();
      if (cached != null) {
        return cached.toEntity();
      }
      final all = await localDataSource.getAll();
      if (all.isNotEmpty) {
        return all.first.toEntity();
      }
      rethrow;
    }
  }`
            : `  @override
  Future<${m.modelNamePascal}Entity> get${m.modelNamePascal}Data() async {
    final model = await remoteDataSource.fetch${m.modelNamePascal}Data();
    return model.toEntity();
  }`;

        const modelConstructorArgs = m.properties.map(p => {
            const camel = toCamelCase(p.name);
            const childName = p.childModelPascal || (p.type.includes('Model') ? p.type.replace(/^List<([a-zA-Z0-9_]+)Model(\?)?>.*$/, '$1').replace(/Model(\?)?$/, '') : undefined);
            if (p.isNestedList && childName) {
                return `${camel}: entity.${p.name}?.map((e) => ${childName}Model.fromEntity(e)).toList(),`;
            }
            if (p.isNestedModel && childName) {
                return `${camel}: entity.${p.name} != null ? ${childName}Model.fromEntity(entity.${p.name}!) : null,`;
            }
            return `${camel}: entity.${p.name},`;
        }).join('\n      ');

        const createMethodBody = useHive
            ? `  @override
  Future<${m.modelNamePascal}Entity> create${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${modelConstructorArgs}
    );
    try {
      final result = await remoteDataSource.create${m.modelNamePascal}(model);
      await localDataSource.save(result);
      return result.toEntity();
    } catch (_) {
      await localDataSource.save(model);
      return entity;
    }
  }`
            : `  @override
  Future<${m.modelNamePascal}Entity> create${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${modelConstructorArgs}
    );
    final result = await remoteDataSource.create${m.modelNamePascal}(model);
    return result.toEntity();
  }`;

        const updateMethodBody = useHive
            ? `  @override
  Future<${m.modelNamePascal}Entity> update${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${modelConstructorArgs}
    );
    try {
      final result = await remoteDataSource.update${m.modelNamePascal}(model);
      await localDataSource.update(result);
      return result.toEntity();
    } catch (_) {
      await localDataSource.update(model);
      return entity;
    }
  }`
            : `  @override
  Future<${m.modelNamePascal}Entity> update${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${modelConstructorArgs}
    );
    final result = await remoteDataSource.update${m.modelNamePascal}(model);
    return result.toEntity();
  }`;

        const patchMethodBody = useHive
            ? `  @override
  Future<${m.modelNamePascal}Entity> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data) async {
    try {
      final result = await remoteDataSource.patch${m.modelNamePascal}(id, data);
      await localDataSource.update(result);
      return result.toEntity();
    } catch (_) {
      final existing = await localDataSource.getById(id);
      if (existing != null) {
        final updatedJson = existing.toJson()..addAll(data);
        final updated = ${m.modelNamePascal}Model.fromJson(updatedJson);
        await localDataSource.update(updated);
        return updated.toEntity();
      }
      final cached = await localDataSource.getLast${m.modelNamePascal}();
      if (cached != null) {
        return cached.toEntity();
      }
      rethrow;
    }
  }`
            : `  @override
  Future<${m.modelNamePascal}Entity> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data) async {
    final result = await remoteDataSource.patch${m.modelNamePascal}(id, data);
    return result.toEntity();
  }`;

        const deleteMethodBody = useHive
            ? `  @override
  Future<void> delete${m.modelNamePascal}(dynamic id) async {
    try {
      await remoteDataSource.delete${m.modelNamePascal}(id);
    } catch (_) {}
    await localDataSource.delete(id);
  }`
            : `  @override
  Future<void> delete${m.modelNamePascal}(dynamic id) async {
    await remoteDataSource.delete${m.modelNamePascal}(id);
  }`;

        fs.writeFileSync(
            path.join(dataDir, 'repositories', `${m.modelNameSnake}_repository_impl.dart`),
            `${repoInjectableImport}import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/repositories/${m.modelNameSnake}_repository.dart';
import '../datasources/${m.modelNameSnake}_remote_data_source.dart';
${repoLocalImport}import '../models/${m.modelNameSnake}_model.dart';

${repoInjectableAnnot}class ${m.modelNamePascal}RepositoryImpl implements ${m.modelNamePascal}Repository {
${repoFields}

${getListMethodBody}

${getMethodBody}

${createMethodBody}

${updateMethodBody}

${patchMethodBody}

${deleteMethodBody}
}
`
        );
    }

    // 7. State Management
    if (stateMgmt === 'BLoC') {
        const blocPath = path.join(presDir, 'bloc', `${name}_bloc.dart`);
        const eventPath = path.join(presDir, 'bloc', `${name}_event.dart`);
        const statePath = path.join(presDir, 'bloc', `${name}_state.dart`);

        let primaryModel = models[0];
        if (useHive && models.length > 1) {
            const listProp = models[0].properties.find(p => p.isNestedList && p.childModelPascal);
            if (listProp) {
                const child = models.find(m => m.modelNamePascal === listProp.childModelPascal);
                if (child) {
                    primaryModel = child;
                }
            }
        }

        if (!skipPageIfExists || !fs.existsSync(blocPath)) {
            // Event
            const hiveEvents = (useHive && models.length > 0)
                ? `\nclass Load${pascal}ListEvent extends ${pascal}Event {}\n
class Add${pascal}Event extends ${pascal}Event {
  final ${models[0].modelNamePascal}Entity item;
  Add${pascal}Event(this.item);
}

class Update${pascal}Event extends ${pascal}Event {
  final ${models[0].modelNamePascal}Entity item;
  Update${pascal}Event(this.item);
}

class Toggle${pascal}StatusEvent extends ${pascal}Event {
  final ${models[0].modelNamePascal}Entity item;
  Toggle${pascal}StatusEvent(this.item);
}

class Delete${pascal}Event extends ${pascal}Event {
  final dynamic id;
  Delete${pascal}Event(this.id);
}

class Filter${pascal}Event extends ${pascal}Event {
  final String? searchQuery;
  final String? statusFilter;
  final String? priorityFilter;

  Filter${pascal}Event({
    this.searchQuery,
    this.statusFilter,
    this.priorityFilter,
  });
}\n`
                : '';

            fs.writeFileSync(
                eventPath,
                `part of '${name}_bloc.dart';

abstract class ${pascal}Event {}

class Fetch${pascal}Event extends ${pascal}Event {}${hiveEvents}
`
            );

            // State
            const stateFields = models.map(m => `  final ${m.modelNamePascal}Entity? ${m.modelNameCamel}Data;`).join('\n');
            const stateConstructorArgs = models.map(m => `    this.${m.modelNameCamel}Data,`).join('\n');

            let stateLoadedClass = `class ${pascal}Loaded extends ${pascal}State {}`;
            if (models.length > 0) {
                if (useHive) {
                    const primary = primaryModel;
                    stateLoadedClass = `class ${pascal}Loaded extends ${pascal}State {
${stateFields}
  final List<${primary.modelNamePascal}Entity> allItems;
  final List<${primary.modelNamePascal}Entity> filteredItems;
  final String searchQuery;
  final String statusFilter;
  final String priorityFilter;

  ${pascal}Loaded({
${stateConstructorArgs}
    this.allItems = const [],
    this.filteredItems = const [],
    this.searchQuery = '',
    this.statusFilter = 'All',
    this.priorityFilter = 'All',
  });

  ${pascal}Loaded copyWith({
${models.map(m => `    ${m.modelNamePascal}Entity? ${m.modelNameCamel}Data,`).join('\n')}
    List<${primary.modelNamePascal}Entity>? allItems,
    List<${primary.modelNamePascal}Entity>? filteredItems,
    String? searchQuery,
    String? statusFilter,
    String? priorityFilter,
  }) {
    return ${pascal}Loaded(
${models.map(m => `      ${m.modelNameCamel}Data: ${m.modelNameCamel}Data ?? this.${m.modelNameCamel}Data,`).join('\n')}
      allItems: allItems ?? this.allItems,
      filteredItems: filteredItems ?? this.filteredItems,
      searchQuery: searchQuery ?? this.searchQuery,
      statusFilter: statusFilter ?? this.statusFilter,
      priorityFilter: priorityFilter ?? this.priorityFilter,
    );
  }
}`;
                } else {
                    stateLoadedClass = `class ${pascal}Loaded extends ${pascal}State {
${stateFields}

  ${pascal}Loaded({
${stateConstructorArgs}
  });
}`;
                }
            }

            fs.writeFileSync(
                statePath,
                `part of '${name}_bloc.dart';

abstract class ${pascal}State {}

class ${pascal}Initial extends ${pascal}State {}
class ${pascal}Loading extends ${pascal}State {}
${stateLoadedClass}
class ${pascal}Error extends ${pascal}State {
  final String message;
  ${pascal}Error(this.message);
}
`
            );

            // Bloc
            const blocImports = models.map(m => `import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/patch_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/delete_${m.modelNameSnake}_usecase.dart';`).join('\n');
            const blocFields = models.map(m => `  final Get${m.modelNamePascal}UseCase get${m.modelNamePascal}UseCase;
  final Create${m.modelNamePascal}UseCase create${m.modelNamePascal}UseCase;
  final Update${m.modelNamePascal}UseCase update${m.modelNamePascal}UseCase;
  final Patch${m.modelNamePascal}UseCase patch${m.modelNamePascal}UseCase;
  final Delete${m.modelNamePascal}UseCase delete${m.modelNamePascal}UseCase;`).join('\n');
            const blocConstructorArgs = models.map(m => `    required this.get${m.modelNamePascal}UseCase,
    required this.create${m.modelNamePascal}UseCase,
    required this.update${m.modelNamePascal}UseCase,
    required this.patch${m.modelNamePascal}UseCase,
    required this.delete${m.modelNamePascal}UseCase,`).join('\n');
            
            let parallelExecution = '';
            let emitLoadedCall = `emit(${pascal}Loaded());`;
            if (models.length > 0) {
                parallelExecution = `final results = await Future.wait([
          ${models.map(m => `get${m.modelNamePascal}UseCase.execute().then<${m.modelNamePascal}Entity?>((v) => v).catchError((_) => null),`).join('\n          ')}
        ]);`;
                const loadedConstructorParams = models.map((m, idx) => `          ${m.modelNameCamel}Data: results[${idx}]${models.length > 1 ? ` as ${m.modelNamePascal}Entity?` : ''},`).join('\n');
                emitLoadedCall = `emit(${pascal}Loaded(
${loadedConstructorParams}
        ));`;
            }

            const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
            const blocInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const blocInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const constructorBlock = models.length > 0
                ? `  ${pascal}Bloc({
${blocConstructorArgs}
  }) : super(${pascal}Initial())`
                : `  ${pascal}Bloc() : super(${pascal}Initial())`;

            let blocHandlers = `    on<Fetch${pascal}Event>((event, emit) async {
      emit(${pascal}Loading());
      try {
        ${parallelExecution}

        ${emitLoadedCall}
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });`;

            if (useHive && models.length > 0) {
                const primary = primaryModel;
                blocHandlers += `

    on<Load${pascal}ListEvent>((event, emit) async {
      emit(${pascal}Loading());
      try {
        final list = await get${primary.modelNamePascal}UseCase.executeList().catchError((_) => <${primary.modelNamePascal}Entity>[]);
        final currentQuery = state is ${pascal}Loaded ? (state as ${pascal}Loaded).searchQuery : '';
        final currentStatus = state is ${pascal}Loaded ? (state as ${pascal}Loaded).statusFilter : 'All';
        final currentPriority = state is ${pascal}Loaded ? (state as ${pascal}Loaded).priorityFilter : 'All';
        emit(${pascal}Loaded(
          ${primary.modelNameCamel}Data: list.isNotEmpty ? list.first : null,
          allItems: list,
          filteredItems: _filterItems(list, currentQuery, currentStatus, currentPriority),
          searchQuery: currentQuery,
          statusFilter: currentStatus,
          priorityFilter: currentPriority,
        ));
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });

    on<Add${pascal}Event>((event, emit) async {
      try {
        await create${primary.modelNamePascal}UseCase.execute(event.item);
        add(Load${pascal}ListEvent());
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });

    on<Update${pascal}Event>((event, emit) async {
      try {
        await update${primary.modelNamePascal}UseCase.execute(event.item);
        add(Load${pascal}ListEvent());
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });

    ${(() => {
                const statusProp = primary.properties.find(p => /^(status|state)$/i.test(p.name));
                const boolDoneProp = primary.properties.find(p => /^(is_?completed|is_?done|completed|done)$/i.test(p.name));
                let body = "";
                if (statusProp) {
                    body = `final newStatus = event.item.isCompleted ? Pending : Completed;
        final updated = event.item.copyWith(${statusProp.name}: newStatus);
        await update${primary.modelNamePascal}UseCase.execute(updated);
        add(Load${pascal}ListEvent());`;
                } else if (boolDoneProp) {
                    body = `final updated = event.item.copyWith(${boolDoneProp.name}: !event.item.isCompleted);
        await update${primary.modelNamePascal}UseCase.execute(updated);
        add(Load${pascal}ListEvent());`;
                } else {
                    body = "// No status or completion field defined on model";
                }
                return `on<Toggle${pascal}StatusEvent>((event, emit) async {
      try {
        ${body}
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });`;
            })()}

    on<Delete${pascal}Event>((event, emit) async {
      try {
        await delete${primary.modelNamePascal}UseCase.execute(event.id);
        add(Load${pascal}ListEvent());
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });

    on<Filter${pascal}Event>((event, emit) {
      if (state is ${pascal}Loaded) {
        final current = state as ${pascal}Loaded;
        final q = event.searchQuery ?? current.searchQuery;
        final s = event.statusFilter ?? current.statusFilter;
        final p = event.priorityFilter ?? current.priorityFilter;
        emit(current.copyWith(
          searchQuery: q,
          statusFilter: s,
          priorityFilter: p,
          filteredItems: _filterItems(current.allItems, q, s, p),
        ));
      }
    });`;
            }

            const helperFilterMethod = (useHive && models.length > 0)
                ? `\n  List<${models[0].modelNamePascal}Entity> _filterItems(
    List<${models[0].modelNamePascal}Entity> items,
    String query,
    String status,
    String priority,
  ) {
    return items.where((item) {
      if (query.isNotEmpty) {
        final q = query.toLowerCase();
        final match = item.toString().toLowerCase().contains(q);
        if (!match) return false;
      }
      if (status != 'All') {
        try {
          if ((item as dynamic).status?.toString().toLowerCase() != status.toLowerCase()) {
            return false;
          }
        } catch (_) {}
      }
      if (priority != 'All') {
        try {
          if ((item as dynamic).priority?.toString().toLowerCase() != priority.toLowerCase()) {
            return false;
          }
        } catch (_) {}
      }
      return true;
    }).toList();
  }\n`
                : '';

            fs.writeFileSync(
                blocPath,
                `import 'package:flutter_bloc/flutter_bloc.dart';
${blocInjectableImport}${blocImports}

part '${name}_event.dart';
part '${name}_state.dart';

${blocInjectableAnnot}class ${pascal}Bloc extends Bloc<${pascal}Event, ${pascal}State> {
${blocFields}

${constructorBlock} {
${blocHandlers}
  }
${helperFilterMethod}}
`
            );
        }

        // Page (with static route definition)
        const pagePath = path.join(presDir, 'pages', `${name}_page.dart`);
        if (!skipPageIfExists || !fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf8').trim() === '') {
            const pageContent = (useHive && models.length > 0)
                ? renderHiveOfflineCleanArchPage(name, pascal, primaryModel, packageName)
                : `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../bloc/${name}_bloc.dart';

class ${pascal}Page extends StatelessWidget {
  static const route = '/${name}';
  const ${pascal}Page({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => getIt<${pascal}Bloc>()..add(Fetch${pascal}Event()),
      child: Scaffold(
        appBar: AppBar(title: const Text('${pascal}')),
        body: BlocBuilder<${pascal}Bloc, ${pascal}State>(
          builder: (context, state) {
            if (state is ${pascal}Loading) {
              return const Center(child: CircularProgressIndicator());
            } else if (state is ${pascal}Loaded) {
              return const Center(child: Text('All APIs Loaded Resiliently (with Null-Safety)!'));
            } else if (state is ${pascal}Error) {
              return Center(child: Text(state.message));
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }
}
`;
            fs.writeFileSync(pagePath, pageContent);
        }
    } else if (stateMgmt === 'Riverpod') {
        // Riverpod
        const providerPath = path.join(presDir, 'riverpod', `${name}_provider.dart`);
        if (!skipPageIfExists || !fs.existsSync(providerPath)) {
            const notifierImports = models.map(m => `import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';`).join('\n');

            let notifierBuildBody = '';
            if (models.length > 0) {
                notifierBuildBody = `final results = await Future.wait([
      ${models.map(m => `getIt<Get${m.modelNamePascal}UseCase>().execute().then<${m.modelNamePascal}Entity?>((v) => v).catchError((_) => null),`).join('\n      ')}
    ]);
    return results;`;
            } else {
                notifierBuildBody = `return [];`;
            }

            fs.writeFileSync(
                providerPath,
                `import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:${packageName}/core/di/injection.dart';
${notifierImports}

part '${name}_provider.g.dart';

@riverpod
class ${pascal}Notifier extends _\$${pascal}Notifier {
  @override
  FutureOr<List<dynamic>> build() async {
    ${notifierBuildBody}
  }
}
`
            );
        }

        // Page (with static route definition)
        const pagePath = path.join(presDir, 'pages', `${name}_page.dart`);
        if (!skipPageIfExists || !fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf8').trim() === '') {
            fs.writeFileSync(
                pagePath,
                `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../riverpod/${name}_provider.dart';

class ${pascal}Page extends ConsumerWidget {
  static const route = '/${name}';
  const ${pascal}Page({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(${camel}NotifierProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: state.when(
        data: (dataList) => const Center(child: Text('All APIs Loaded Resiliently (with Null-Safety)!')),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text(err.toString())),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'PureBind') {
        const controllerPath = path.join(presDir, 'controllers', `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(controllerPath)) {
            const controllerFields = models.map(m => `  final Get${m.modelNamePascal}UseCase get${m.modelNamePascal}UseCase;
  final Create${m.modelNamePascal}UseCase create${m.modelNamePascal}UseCase;
  final Update${m.modelNamePascal}UseCase update${m.modelNamePascal}UseCase;
  final Patch${m.modelNamePascal}UseCase patch${m.modelNamePascal}UseCase;
  final Delete${m.modelNamePascal}UseCase delete${m.modelNamePascal}UseCase;`).join('\n');

            const controllerConstructorArgs = models.map(m => `    required this.get${m.modelNamePascal}UseCase,
    required this.create${m.modelNamePascal}UseCase,
    required this.update${m.modelNamePascal}UseCase,
    required this.patch${m.modelNamePascal}UseCase,
    required this.delete${m.modelNamePascal}UseCase,`).join('\n');

            const controllerImports = models.map(m => `import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/patch_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/delete_${m.modelNameSnake}_usecase.dart';
import '../../domain/entities/${m.modelNameSnake}_entity.dart';`).join('\n');

            const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
            const controllerInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const controllerInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const constructorBlock = models.length > 0
                ? `  ${pascal}Controller({
${controllerConstructorArgs}
  });`
                : `  ${pascal}Controller();`;

            const pureFields = models.map(m => `  final ${m.modelNameCamel}Data = Pure<${m.modelNamePascal}Entity?>(null);`).join('\n');
            const pureAssigns = models.map((m, idx) => `      ${m.modelNameCamel}Data.value = results[${idx}] as ${m.modelNamePascal}Entity?;`).join('\n');
            const pureFetchBody = models.length > 0
                ? `final results = await Future.wait([
        ${models.map(m => `get${m.modelNamePascal}UseCase.execute().then<${m.modelNamePascal}Entity?>((v) => v).catchError((_) => null),`).join('\n        ')}
      ]);
${pureAssigns}`
                : '';

            fs.writeFileSync(
                controllerPath,
                `import 'package:purebind/purebind.dart';
${controllerInjectableImport}${controllerImports}

${controllerInjectableAnnot}class ${pascal}Controller {
${controllerFields}

${constructorBlock}

  final isLoading = Pure<bool>(false);
  final errorMessage = Pure<String?>(null);
${pureFields}

  Future<void> fetch${pascal}Data() async {
    isLoading.value = true;
    errorMessage.value = null;
    try {
      ${pureFetchBody}
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isLoading.value = false;
    }
  }
}
`
            );
        }

        const pagePath = path.join(presDir, 'pages', `${name}_page.dart`);
        if (!skipPageIfExists || !fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf8').trim() === '') {
            fs.writeFileSync(
                pagePath,
                `import 'package:flutter/material.dart';
import 'package:purebind/purebind.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}Page extends StatelessWidget {
  static const route = '/${name}';
  final ${pascal}Controller controller = getIt<${pascal}Controller>();

  ${pascal}Page({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: PureConsumer<String?>(
        pure: controller.errorMessage,
        listener: (context, error) {
          if (error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error)),
            );
          }
        },
        child: PureBuilder<bool>(
          pure: controller.isLoading,
          builder: (context, isLoading) {
            if (isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            return const Center(child: Text('${pascal} Feature with PureBind!'));
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: controller.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'GetX') {
        const controllerPath = path.join(presDir, 'controllers', `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(controllerPath)) {
            const controllerFields = models.map(m => `  final Get${m.modelNamePascal}UseCase get${m.modelNamePascal}UseCase;
  final Create${m.modelNamePascal}UseCase create${m.modelNamePascal}UseCase;
  final Update${m.modelNamePascal}UseCase update${m.modelNamePascal}UseCase;
  final Patch${m.modelNamePascal}UseCase patch${m.modelNamePascal}UseCase;
  final Delete${m.modelNamePascal}UseCase delete${m.modelNamePascal}UseCase;`).join('\n');

            const controllerConstructorArgs = models.map(m => `    required this.get${m.modelNamePascal}UseCase,
    required this.create${m.modelNamePascal}UseCase,
    required this.update${m.modelNamePascal}UseCase,
    required this.patch${m.modelNamePascal}UseCase,
    required this.delete${m.modelNamePascal}UseCase,`).join('\n');

            const controllerImports = models.map(m => `import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/patch_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/delete_${m.modelNameSnake}_usecase.dart';
import '../../domain/entities/${m.modelNameSnake}_entity.dart';`).join('\n');

            const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
            const controllerInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const controllerInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const constructorBlock = models.length > 0
                ? `  ${pascal}Controller({
${controllerConstructorArgs}
  });`
                : `  ${pascal}Controller();`;

            fs.writeFileSync(
                controllerPath,
                `import 'package:get/get.dart';
${controllerInjectableImport}${controllerImports}

${controllerInjectableAnnot}class ${pascal}Controller extends GetxController {
${controllerFields}

${constructorBlock}

  final isLoading = false.obs;
  final errorMessage = Rxn<String>();

  Future<void> fetch${pascal}Data() async {
    isLoading.value = true;
    errorMessage.value = null;
    try {
      await Future.wait([
        ${models.map(m => `get${m.modelNamePascal}UseCase.execute(),`).join('\n        ')}
      ]);
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isLoading.value = false;
    }
  }
}
`
            );
        }

        const pagePath = path.join(presDir, 'pages', `${name}_page.dart`);
        if (!skipPageIfExists || !fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf8').trim() === '') {
            fs.writeFileSync(
                pagePath,
                `import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}Page extends StatefulWidget {
  static const route = '/${name}';
  ${pascal}Page({super.key});

  @override
  State<${pascal}Page> createState() => _${pascal}PageState();
}

class _${pascal}PageState extends State<${pascal}Page> {
  final ${pascal}Controller controller = getIt<${pascal}Controller>();

  @override
  void initState() {
    super.initState();
    controller.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.errorMessage.value != null) {
          return Center(child: Text(controller.errorMessage.value!));
        }
        return const Center(child: Text('${pascal} Feature with GetX!'));
      }),
      floatingActionButton: FloatingActionButton(
        onPressed: controller.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'Provider') {
        const notifierPath = path.join(presDir, 'provider', `${name}_notifier.dart`);
        if (!skipPageIfExists || !fs.existsSync(notifierPath)) {
            const notifierFields = models.map(m => `  final Get${m.modelNamePascal}UseCase get${m.modelNamePascal}UseCase;
  final Create${m.modelNamePascal}UseCase create${m.modelNamePascal}UseCase;
  final Update${m.modelNamePascal}UseCase update${m.modelNamePascal}UseCase;
  final Patch${m.modelNamePascal}UseCase patch${m.modelNamePascal}UseCase;
  final Delete${m.modelNamePascal}UseCase delete${m.modelNamePascal}UseCase;`).join('\n');

            const notifierConstructorArgs = models.map(m => `    required this.get${m.modelNamePascal}UseCase,
    required this.create${m.modelNamePascal}UseCase,
    required this.update${m.modelNamePascal}UseCase,
    required this.patch${m.modelNamePascal}UseCase,
    required this.delete${m.modelNamePascal}UseCase,`).join('\n');

            const notifierImports = models.map(m => `import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/patch_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/delete_${m.modelNameSnake}_usecase.dart';
import '../../domain/entities/${m.modelNameSnake}_entity.dart';`).join('\n');

            const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
            const notifierInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const notifierInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const constructorBlock = models.length > 0
                ? `  ${pascal}Notifier({
${notifierConstructorArgs}
  });`
                : `  ${pascal}Notifier();`;

            const stateFields = models.map(m => `  ${m.modelNamePascal}Entity? ${m.modelNameCamel}Data;`).join('\n');
            const fetchCalls = models.map(m => `      ${m.modelNameCamel}Data = await get${m.modelNamePascal}UseCase.execute().then<${m.modelNamePascal}Entity?>((v) => v).catchError((_) => null);`).join('\n');

            fs.writeFileSync(
                notifierPath,
                `import 'package:flutter/foundation.dart';
${notifierInjectableImport}${notifierImports}

${notifierInjectableAnnot}class ${pascal}Notifier extends ChangeNotifier {
${notifierFields}

${constructorBlock}

${stateFields}
  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  Future<void> fetch${pascal}Data() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
${fetchCalls}
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
`
            );
        }

        const pagePath = path.join(presDir, 'pages', `${name}_page.dart`);
        if (!skipPageIfExists || !fs.existsSync(pagePath) || fs.readFileSync(pagePath, 'utf8').trim() === '') {
            fs.writeFileSync(
                pagePath,
                `import 'package:flutter/material.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../provider/${name}_notifier.dart';

class ${pascal}Page extends StatefulWidget {
  static const route = '/${name}';
  const ${pascal}Page({super.key});

  @override
  State<${pascal}Page> createState() => _${pascal}PageState();
}

class _${pascal}PageState extends State<${pascal}Page> {
  final ${pascal}Notifier notifier = getIt<${pascal}Notifier>();

  @override
  void initState() {
    super.initState();
    notifier.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: notifier,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(title: const Text('${pascal}')),
          body: notifier.isLoading
              ? const Center(child: CircularProgressIndicator())
              : notifier.errorMessage != null
                  ? Center(child: Text(notifier.errorMessage!))
                  : const Center(child: Text('${pascal} Page with Provider!')),
          floatingActionButton: FloatingActionButton(
            onPressed: notifier.fetch${pascal}Data,
            child: const Icon(Icons.refresh),
          ),
        );
      },
    );
  }
}
`
            );
        }
    }
}

function renderMvcMvvmModelClass(model: FeatureModel): string {
    const modelPropertiesDecl = model.properties.map(p => {
        const camelName = toCamelCase(p.name);
        if (camelName !== p.name) {
            return `    @JsonKey(name: '${p.name}') required ${p.type} ${camelName},`;
        }
        return `    required ${p.type} ${p.name},`;
    }).join('\n');

    let result = `@freezed
abstract class ${model.modelNamePascal}Model with _\$${model.modelNamePascal}Model {
  @JsonSerializable(explicitToJson: true)
  const factory ${model.modelNamePascal}Model({
${modelPropertiesDecl}
  }) = _${model.modelNamePascal}Model;

  factory ${model.modelNamePascal}Model.fromJson(Map<String, dynamic> json) => _\$${model.modelNamePascal}ModelFromJson(json);
}
`;
    if (model.childModels && model.childModels.length > 0) {
        for (const child of model.childModels) {
            result += '\n' + renderMvcMvvmModelClass(child);
        }
    }
    return result;
}

export function generateMVCFiles(
    targetDir: string, 
    name: string, 
    pascal: string, 
    camel: string, 
    stateMgmt: string, 
    models: FeatureModel[],
    packageName: string,
    skipPageIfExists = false,
    useHive = false
) {
    const featDir = path.join(targetDir, name);
    const modelsDir = path.join(featDir, 'models');
    const ctrlDir = path.join(featDir, 'controllers');
    const viewsDir = path.join(featDir, 'views');

    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.mkdirSync(viewsDir, { recursive: true });

    // Generate models
    for (const m of models) {
        fs.writeFileSync(
            path.join(modelsDir, `${m.modelNameSnake}_model.dart`),
            `import 'package:freezed_annotation/freezed_annotation.dart';

part '${m.modelNameSnake}_model.freezed.dart';
part '${m.modelNameSnake}_model.g.dart';

${renderMvcMvvmModelClass(m)}
`
        );
    }

    // Create services directory for MVC API Calls
    const servicesDir = path.join(featDir, 'services');
    fs.mkdirSync(servicesDir, { recursive: true });

    const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
    for (const m of models) {
        const servicePath = path.join(servicesDir, `${m.modelNameSnake}_api_service.dart`);
        if (!fs.existsSync(servicePath)) {
            const serviceInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const serviceInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}ApiService)\n` : "";

            fs.writeFileSync(
                servicePath,
                `${serviceInjectableImport}import 'package:dio/dio.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}ApiService {
  Future<${m.modelNamePascal}Model?> get${m.modelNamePascal}();
  Future<${m.modelNamePascal}Model?> create${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model?> update${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model?> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data);
  Future<bool> delete${m.modelNamePascal}(dynamic id);
}

${serviceInjectableAnnot}class ${m.modelNamePascal}ApiServiceImpl implements ${m.modelNamePascal}ApiService {
  final Dio dio;

  ${m.modelNamePascal}ApiServiceImpl(this.dio);

  ${m.modelNamePascal}Model? _parseResponse(dynamic data) {
    if (data == null) return null;
    if (data is Map<String, dynamic>) {
      final inner = data['data'] ?? data['result'] ?? data;
      if (inner is Map<String, dynamic>) {
        return ${m.modelNamePascal}Model.fromJson(inner);
      }
      return ${m.modelNamePascal}Model.fromJson(data);
    }
    return null;
  }

  @override
  Future<${m.modelNamePascal}Model?> get${m.modelNamePascal}() async {
    try {
      final response = await dio.getRequest('/${m.modelNameSnake}');
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> create${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.postRequest('/${m.modelNameSnake}', data: model.toJson());
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> update${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.putRequest('/${m.modelNameSnake}', data: model.toJson());
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data) async {
    try {
      final response = await dio.patchRequest('/${m.modelNameSnake}/\$id', data: data);
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<bool> delete${m.modelNamePascal}(dynamic id) async {
    try {
      final response = await dio.deleteRequest('/${m.modelNameSnake}/\$id');
      return response.statusCode == 200 || response.statusCode == 204;
    } catch (_) {
      return false;
    }
  }
}
`
            );
        }
    }

    if (useHive) {
        for (const m of models) {
            const localServicePath = path.join(servicesDir, `${m.modelNameSnake}_local_service.dart`);
            if (!fs.existsSync(localServicePath)) {
                const serviceInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
                const serviceInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}LocalService)\n` : "";
                const mIdProp = m.properties.find(p => /^(id|_id|uuid)$/i.test(p.name)) || m.properties.find(p => /id$/i.test(p.name));
                const localKeyAccessor = (mIdProp && mIdProp.name !== 'id') ? `(model as dynamic).${mIdProp.name}?.toString() ?? ` : '';

                fs.writeFileSync(
                    localServicePath,
                    `${serviceInjectableImport}import 'dart:convert';
import 'package:${packageName}/core/services/hive_service.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}LocalService {
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}();
  Future<List<${m.modelNamePascal}Model>> getAll();
  Future<${m.modelNamePascal}Model?> getById(dynamic id);
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<void> save(${m.modelNamePascal}Model model);
  Future<void> update(${m.modelNamePascal}Model model);
  Future<void> delete(dynamic id);
  Future<void> clear();
  Future<void> clearCache();
}

${serviceInjectableAnnot}class ${m.modelNamePascal}LocalServiceImpl implements ${m.modelNamePascal}LocalService {
  final HiveService hiveService;
  static const String boxName = '${m.modelNameSnake}_box';
  static const String cacheKey = 'cached_${m.modelNameSnake}';

  ${m.modelNamePascal}LocalServiceImpl([HiveService? hiveService])
      : hiveService = hiveService ?? HiveService();

  @override
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}() async {
    final box = await hiveService.openBox(boxName);
    final rawData = box.get(cacheKey);
    if (rawData != null) {
      final json = jsonDecode(jsonEncode(rawData)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    final all = await getAll();
    if (all.isNotEmpty) return all.first;
    return null;
  }

  @override
  Future<List<${m.modelNamePascal}Model>> getAll() async {
    final box = await hiveService.openBox(boxName);
    final items = <${m.modelNamePascal}Model>[];
    for (final key in box.keys) {
      if (key == cacheKey) continue;
      final raw = box.get(key);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    if (items.isEmpty && box.containsKey(cacheKey)) {
      final raw = box.get(cacheKey);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    return items;
  }

  @override
  Future<${m.modelNamePascal}Model?> getById(dynamic id) async {
    final box = await hiveService.openBox(boxName);
    final raw = box.get(id.toString());
    if (raw != null) {
      final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    return null;
  }

  @override
  Future<void> save(${m.modelNamePascal}Model model) async {
    final rawJson = jsonDecode(jsonEncode(model.toJson()));
    final key = ${localKeyAccessor}(model as dynamic).id?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString();
    await hiveService.put(key, rawJson, boxName: boxName);
    await hiveService.put(cacheKey, rawJson, boxName: boxName);
  }

  @override
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> update(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> delete(dynamic id) async {
    await hiveService.delete(id.toString(), boxName: boxName);
  }

  @override
  Future<void> clearCache() async {
    await hiveService.delete(cacheKey, boxName: boxName);
  }

  @override
  Future<void> clear() async {
    await hiveService.clear(boxName: boxName);
  }
}
`
                );
            }
        }
    }

    // Controller & View depending on State Management
    if (stateMgmt === 'BLoC') {
        const ctrlPath = path.join(ctrlDir, `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(ctrlPath)) {
            const stateFields = models.map(m => `  final ${m.modelNamePascal}Model? ${m.modelNameCamel}Model;`).join('\n');
            const stateConstructorArgs = models.map(m => `this.${m.modelNameCamel}Model,`).join('\n');

            const ctrlInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const ctrlInjectableAnnot = useInjectable ? "@injectable\n" : "";

            fs.writeFileSync(
                ctrlPath,
                `import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter/foundation.dart';
${ctrlInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

abstract class ${pascal}State {}
class ${pascal}Initial extends ${pascal}State {}
class ${pascal}Loading extends ${pascal}State {}
class ${pascal}Loaded extends ${pascal}State {
${stateFields}
  ${pascal}Loaded({
${stateConstructorArgs}
  });
}
class ${pascal}Error extends ${pascal}State {
  final String message;
  ${pascal}Error(this.message);
}

${ctrlInjectableAnnot}class ${pascal}Controller extends Cubit<${pascal}State> {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

  ${pascal}Controller(${models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ')}) : super(${pascal}Initial());

  Future<void> fetch${pascal}Data() async {
    emit(${pascal}Loading());
    try {
      final results = await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);

      emit(${pascal}Loaded(
        ${models.map((m, idx) => `${m.modelNameCamel}Model: results[${idx}] as ${m.modelNamePascal}Model?,`).join('\n        ')}
      ));
    } catch (e) {
      emit(${pascal}Error(e.toString()));
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}View extends StatelessWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => getIt<${pascal}Controller>()..fetch${pascal}Data(),
      child: Scaffold(
        appBar: AppBar(title: const Text('${pascal}')),
        body: BlocBuilder<${pascal}Controller, ${pascal}State>(
          builder: (context, state) {
            if (state is ${pascal}Loading) {
              return const Center(child: CircularProgressIndicator());
            } else if (state is ${pascal}Loaded) {
              return const Center(child: Text('MVC BLoC Data Loaded Resiliently!'));
            } else if (state is ${pascal}Error) {
              return Center(child: Text(state.message));
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'PureBind') {
        const ctrlPath = path.join(ctrlDir, `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(ctrlPath)) {
            const ctrlInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const ctrlInjectableAnnot = useInjectable ? "@injectable\n" : "";

            fs.writeFileSync(
                ctrlPath,
                `import 'package:purebind/purebind.dart';
${ctrlInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

${ctrlInjectableAnnot}class ${pascal}Controller {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

  ${pascal}Controller(${models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ')});

  final isFetching = Pure<bool>(false);
  final errorMessage = Pure<String?>(null);
${models.map(m => `  final ${m.modelNameCamel}Model = Pure<${m.modelNamePascal}Model?>(null);`).join('\n')}

  Future<void> fetch${pascal}Data() async {
    isFetching.value = true;
    errorMessage.value = null;
    try {
      final results = await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
${models.map((m, idx) => `      ${m.modelNameCamel}Model.value = results[${idx}] as ${m.modelNamePascal}Model?;`).join('\n')}
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isFetching.value = false;
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:purebind/purebind.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}View extends StatelessWidget {
  static const route = '/${name}';
  final ${pascal}Controller controller = getIt<${pascal}Controller>();

  ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: PureConsumer<String?>(
        pure: controller.errorMessage,
        listener: (context, error) {
          if (error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error)),
            );
          }
        },
        child: PureBuilder<bool>(
          pure: controller.isFetching,
          builder: (context, isFetching) {
            if (isFetching) {
              return const Center(child: CircularProgressIndicator());
            }
            return const Center(child: Text('${pascal} View with PureBind!'));
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: controller.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'GetX') {
        const ctrlPath = path.join(ctrlDir, `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(ctrlPath)) {
            const ctrlInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const ctrlInjectableAnnot = useInjectable ? "@injectable\n" : "";

            fs.writeFileSync(
                ctrlPath,
                `import 'package:get/get.dart';
${ctrlInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

${ctrlInjectableAnnot}class ${pascal}Controller extends GetxController {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

  ${pascal}Controller(${models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ')});

  final isLoading = false.obs;
  final errorMessage = Rxn<String>();

  Future<void> fetch${pascal}Data() async {
    isLoading.value = true;
    errorMessage.value = null;
    try {
      await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isLoading.value = false;
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}View extends StatefulWidget {
  static const route = '/${name}';
  ${pascal}View({super.key});

  @override
  State<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends State<${pascal}View> {
  final ${pascal}Controller controller = getIt<${pascal}Controller>();

  @override
  void initState() {
    super.initState();
    controller.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: Obx(() {
        if (controller.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (controller.errorMessage.value != null) {
          return Center(child: Text(controller.errorMessage.value!));
        }
        return const Center(child: Text('${pascal} View with GetX!'));
      }),
      floatingActionButton: FloatingActionButton(
        onPressed: controller.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'Riverpod') {
        const ctrlPath = path.join(ctrlDir, `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(ctrlPath)) {
            fs.writeFileSync(
                ctrlPath,
                `import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:dio/dio.dart';
import 'package:${packageName}/core/di/injection.dart';
${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

part '${name}_controller.g.dart';

class ${pascal}State {
  final bool isLoading;
  final bool isSuccess;
  final String? message;
${models.map(m => `  final ${m.modelNamePascal}Model? ${m.modelNameCamel}Model;`).join('\n')}

  const ${pascal}State({
    this.isLoading = false,
    this.isSuccess = false,
    this.message,
${models.map(m => `    this.${m.modelNameCamel}Model,`).join('\n')}
  });

  ${pascal}State copyWith({
    bool? isLoading,
    bool? isSuccess,
    String? message,
${models.map(m => `    ${m.modelNamePascal}Model? ${m.modelNameCamel}Model,`).join('\n')}
  }) {
    return ${pascal}State(
      isLoading: isLoading ?? this.isLoading,
      isSuccess: isSuccess ?? this.isSuccess,
      message: message ?? this.message,
${models.map(m => `      ${m.modelNameCamel}Model: ${m.modelNameCamel}Model ?? this.${m.modelNameCamel}Model,`).join('\n')}
    );
  }
}

@riverpod
class ${pascal}Controller extends _\$${pascal}Controller {
  @override
  ${pascal}State build() {
    return const ${pascal}State();
  }

  Future<void> fetch${pascal}Data() async {
    state = state.copyWith(isLoading: true, isSuccess: false);
    try {
      final results = await Future.wait([
        ${models.map(m => `getIt<${m.modelNamePascal}ApiService>().get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
      state = state.copyWith(
        isLoading: false,
        isSuccess: true,
        ${models.map((m, idx) => `${m.modelNameCamel}Model: results[${idx}] as ${m.modelNamePascal}Model?,`).join('\n        ')}
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, isSuccess: false, message: e.toString());
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}View extends ConsumerStatefulWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  ConsumerState<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends ConsumerState<${pascal}View> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(${camel}ControllerProvider.notifier).fetch${pascal}Data();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(${camel}ControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.message != null
              ? Center(child: Text(state.message!))
              : const Center(child: Text('${pascal} Screen')),
    );
  }
}
`
            );
        }
    } else {
        // MVC with Provider (ChangeNotifier Controller)
        const ctrlPath = path.join(ctrlDir, `${name}_controller.dart`);
        if (!skipPageIfExists || !fs.existsSync(ctrlPath)) {
            fs.writeFileSync(
                ctrlPath,
                `import 'package:flutter/material.dart';
${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

class ${pascal}Controller extends ChangeNotifier {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

  ${pascal}Controller(${models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ')});

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  Future<void> fetch${pascal}Data() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../controllers/${name}_controller.dart';

class ${pascal}View extends StatefulWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  State<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends State<${pascal}View> {
  final ${pascal}Controller controller = getIt<${pascal}Controller>();

  @override
  void initState() {
    super.initState();
    controller.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(title: const Text('${pascal}')),
          body: controller.isLoading
              ? const Center(child: CircularProgressIndicator())
              : controller.errorMessage != null
                  ? Center(child: Text(controller.errorMessage!))
                  : const Center(child: Text('${pascal} Screen')),
        );
      },
    );
  }
}
`
            );
        }
    }
}

export function generateMVVMFiles(
    targetDir: string, 
    name: string, 
    pascal: string, 
    camel: string, 
    stateMgmt: string, 
    models: FeatureModel[],
    packageName: string,
    skipPageIfExists = false,
    useHive = false
) {
    const featDir = path.join(targetDir, name);
    const modelsDir = path.join(featDir, 'models');
    const vmDir = path.join(featDir, 'viewmodels');
    const viewsDir = path.join(featDir, 'views');

    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(vmDir, { recursive: true });
    fs.mkdirSync(viewsDir, { recursive: true });

    // Generate models
    for (const m of models) {
        fs.writeFileSync(
            path.join(modelsDir, `${m.modelNameSnake}_model.dart`),
            `import 'package:freezed_annotation/freezed_annotation.dart';

part '${m.modelNameSnake}_model.freezed.dart';
part '${m.modelNameSnake}_model.g.dart';

${renderMvcMvvmModelClass(m)}
`
        );
    }

    // Create services directory for MVVM API Calls
    const servicesDir = path.join(featDir, 'services');
    fs.mkdirSync(servicesDir, { recursive: true });

    // Generate API Service for each model or feature
    const useInjectable = isInjectableEnabled(findProjectRoot(targetDir));
    for (const m of models) {
        const servicePath = path.join(servicesDir, `${m.modelNameSnake}_api_service.dart`);
        if (!fs.existsSync(servicePath)) {
            const serviceInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const serviceInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}ApiService)\n` : "";

            fs.writeFileSync(
                servicePath,
                `${serviceInjectableImport}import 'package:dio/dio.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}ApiService {
  Future<${m.modelNamePascal}Model?> get${m.modelNamePascal}();
  Future<${m.modelNamePascal}Model?> create${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model?> update${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model?> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data);
  Future<bool> delete${m.modelNamePascal}(dynamic id);
}

${serviceInjectableAnnot}class ${m.modelNamePascal}ApiServiceImpl implements ${m.modelNamePascal}ApiService {
  final Dio dio;

  ${m.modelNamePascal}ApiServiceImpl(this.dio);

  ${m.modelNamePascal}Model? _parseResponse(dynamic data) {
    if (data == null) return null;
    if (data is Map<String, dynamic>) {
      final inner = data['data'] ?? data['result'] ?? data;
      if (inner is Map<String, dynamic>) {
        return ${m.modelNamePascal}Model.fromJson(inner);
      }
      return ${m.modelNamePascal}Model.fromJson(data);
    }
    return null;
  }

  @override
  Future<${m.modelNamePascal}Model?> get${m.modelNamePascal}() async {
    try {
      final response = await dio.getRequest('/${m.modelNameSnake}');
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> create${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.postRequest('/${m.modelNameSnake}', data: model.toJson());
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> update${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    try {
      final response = await dio.putRequest('/${m.modelNameSnake}', data: model.toJson());
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<${m.modelNamePascal}Model?> patch${m.modelNamePascal}(dynamic id, Map<String, dynamic> data) async {
    try {
      final response = await dio.patchRequest('/${m.modelNameSnake}/\$id', data: data);
      return _parseResponse(response.data);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<bool> delete${m.modelNamePascal}(dynamic id) async {
    try {
      final response = await dio.deleteRequest('/${m.modelNameSnake}/\$id');
      return response.statusCode == 200 || response.statusCode == 204;
    } catch (_) {
      return false;
    }
  }
}
`
            );
        }
    }

    if (useHive) {
        for (const m of models) {
            const localServicePath = path.join(servicesDir, `${m.modelNameSnake}_local_service.dart`);
            if (!fs.existsSync(localServicePath)) {
                const serviceInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
                const serviceInjectableAnnot = useInjectable ? `@LazySingleton(as: ${m.modelNamePascal}LocalService)\n` : "";
                const mIdProp = m.properties.find(p => /^(id|_id|uuid)$/i.test(p.name)) || m.properties.find(p => /id$/i.test(p.name));
                const localKeyAccessor = (mIdProp && mIdProp.name !== 'id') ? `(model as dynamic).${mIdProp.name}?.toString() ?? ` : '';

                fs.writeFileSync(
                    localServicePath,
                    `${serviceInjectableImport}import 'dart:convert';
import 'package:${packageName}/core/services/hive_service.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}LocalService {
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}();
  Future<List<${m.modelNamePascal}Model>> getAll();
  Future<${m.modelNamePascal}Model?> getById(dynamic id);
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<void> save(${m.modelNamePascal}Model model);
  Future<void> update(${m.modelNamePascal}Model model);
  Future<void> delete(dynamic id);
  Future<void> clear();
  Future<void> clearCache();
}

${serviceInjectableAnnot}class ${m.modelNamePascal}LocalServiceImpl implements ${m.modelNamePascal}LocalService {
  final HiveService hiveService;
  static const String boxName = '${m.modelNameSnake}_box';
  static const String cacheKey = 'cached_${m.modelNameSnake}';

  ${m.modelNamePascal}LocalServiceImpl([HiveService? hiveService])
      : hiveService = hiveService ?? HiveService();

  @override
  Future<${m.modelNamePascal}Model?> getLast${m.modelNamePascal}() async {
    final box = await hiveService.openBox(boxName);
    final rawData = box.get(cacheKey);
    if (rawData != null) {
      final json = jsonDecode(jsonEncode(rawData)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    final all = await getAll();
    if (all.isNotEmpty) return all.first;
    return null;
  }

  @override
  Future<List<${m.modelNamePascal}Model>> getAll() async {
    final box = await hiveService.openBox(boxName);
    final items = <${m.modelNamePascal}Model>[];
    for (final key in box.keys) {
      if (key == cacheKey) continue;
      final raw = box.get(key);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    if (items.isEmpty && box.containsKey(cacheKey)) {
      final raw = box.get(cacheKey);
      if (raw != null) {
        try {
          final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
          items.add(${m.modelNamePascal}Model.fromJson(json));
        } catch (_) {}
      }
    }
    return items;
  }

  @override
  Future<${m.modelNamePascal}Model?> getById(dynamic id) async {
    final box = await hiveService.openBox(boxName);
    final raw = box.get(id.toString());
    if (raw != null) {
      final json = jsonDecode(jsonEncode(raw)) as Map<String, dynamic>;
      return ${m.modelNamePascal}Model.fromJson(json);
    }
    return null;
  }

  @override
  Future<void> save(${m.modelNamePascal}Model model) async {
    final rawJson = jsonDecode(jsonEncode(model.toJson()));
    final key = ${localKeyAccessor}(model as dynamic).id?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString();
    await hiveService.put(key, rawJson, boxName: boxName);
    await hiveService.put(cacheKey, rawJson, boxName: boxName);
  }

  @override
  Future<void> cache${m.modelNamePascal}(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> update(${m.modelNamePascal}Model model) async {
    await save(model);
  }

  @override
  Future<void> delete(dynamic id) async {
    await hiveService.delete(id.toString(), boxName: boxName);
  }

  @override
  Future<void> clearCache() async {
    await hiveService.delete(cacheKey, boxName: boxName);
  }

  @override
  Future<void> clear() async {
    await hiveService.clear(boxName: boxName);
  }
}
`
                );
            }
        }
    }

    // ViewModel & View depending on State Management
    if (stateMgmt === 'BLoC') {
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            const stateFields = models.map(m => `  final ${m.modelNamePascal}Model? ${m.modelNameCamel}Model;`).join('\n');
            const stateConstructorArgs = models.map(m => `this.${m.modelNameCamel}Model,`).join('\n');

            const vmInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const vmInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const stateLoadedClass = models.length > 0
                ? `class ${pascal}Loaded extends ${pascal}State {
${stateFields}
  ${pascal}Loaded({
${stateConstructorArgs}
  });
}`
                : `class ${pascal}Loaded extends ${pascal}State {}`;

            const vmConstructorArgs = models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ');
            const vmConstructor = models.length > 0
                ? `  ${pascal}ViewModel(${vmConstructorArgs}) : super(${pascal}Initial());`
                : `  ${pascal}ViewModel() : super(${pascal}Initial());`;

            let fetchBody = `emit(${pascal}Loaded());`;
            if (models.length > 0) {
                fetchBody = `final results = await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);

      emit(${pascal}Loaded(
        ${models.map((m, idx) => `${m.modelNameCamel}Model: results[${idx}] as ${m.modelNamePascal}Model?,`).join('\n        ')}
      ));`;
            }

            // ViewModel (as Cubit)
            fs.writeFileSync(
                vmPath,
                `import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter/foundation.dart';
${vmInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

abstract class ${pascal}State {}
class ${pascal}Initial extends ${pascal}State {}
class ${pascal}Loading extends ${pascal}State {}
${stateLoadedClass}
class ${pascal}Error extends ${pascal}State {
  final String message;
  ${pascal}Error(this.message);
}

${vmInjectableAnnot}class ${pascal}ViewModel extends Cubit<${pascal}State> {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

${vmConstructor}

  Future<void> fetch${pascal}Data() async {
    emit(${pascal}Loading());
    try {
      ${fetchBody}
    } catch (e) {
      emit(${pascal}Error(e.toString()));
    }
  }
}
`
            );
        }

        // View (with static route definition)
        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends StatelessWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => getIt<${pascal}ViewModel>()..fetch${pascal}Data(),
      child: Scaffold(
        appBar: AppBar(title: const Text('${pascal}')),
        body: BlocBuilder<${pascal}ViewModel, ${pascal}State>(
          builder: (context, state) {
            if (state is ${pascal}Loading) {
              return const Center(child: CircularProgressIndicator());
            } else if (state is ${pascal}Loaded) {
              return const Center(child: Text('MVVM BLoC Data Loaded Resiliently!'));
            } else if (state is ${pascal}Error) {
              return Center(child: Text(state.message));
            }
            return const SizedBox();
          },
        ),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'PureBind') {
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            const vmInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const vmInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const vmConstructorArgs = models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ');
            const vmConstructor = models.length > 0
                ? `  ${pascal}ViewModel(${vmConstructorArgs});`
                : `  ${pascal}ViewModel();`;

            fs.writeFileSync(
                vmPath,
                `import 'package:purebind/purebind.dart';
${vmInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

${vmInjectableAnnot}class ${pascal}ViewModel {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

${vmConstructor}

  final isFetching = Pure<bool>(false);
  final errorMessage = Pure<String?>(null);

  Future<void> fetch${pascal}Data() async {
    isFetching.value = true;
    errorMessage.value = null;
    try {
      await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isFetching.value = false;
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:purebind/purebind.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends StatelessWidget {
  static const route = '/${name}';
  final ${pascal}ViewModel viewModel = getIt<${pascal}ViewModel>();

  ${pascal}View({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: PureConsumer<String?>(
        pure: viewModel.errorMessage,
        listener: (context, error) {
          if (error != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error)),
            );
          }
        },
        child: PureBuilder<bool>(
          pure: viewModel.isFetching,
          builder: (context, isFetching) {
            if (isFetching) {
              return const Center(child: CircularProgressIndicator());
            }
            return const Center(child: Text('${pascal} View with PureBind!'));
          },
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: viewModel.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'GetX') {
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            const vmInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const vmInjectableAnnot = useInjectable ? "@injectable\n" : "";

            const vmConstructorArgs = models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ');
            const vmConstructor = models.length > 0
                ? `  ${pascal}ViewModel(${vmConstructorArgs});`
                : `  ${pascal}ViewModel();`;

            fs.writeFileSync(
                vmPath,
                `import 'package:get/get.dart';
${vmInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

${vmInjectableAnnot}class ${pascal}ViewModel extends GetxController {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

${vmConstructor}

  final isLoading = false.obs;
  final errorMessage = Rxn<String>();

  Future<void> fetch${pascal}Data() async {
    isLoading.value = true;
    errorMessage.value = null;
    try {
      await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
    } catch (e) {
      errorMessage.value = e.toString();
    } finally {
      isLoading.value = false;
    }
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends StatefulWidget {
  static const route = '/${name}';
  ${pascal}View({super.key});

  @override
  State<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends State<${pascal}View> {
  final ${pascal}ViewModel viewModel = getIt<${pascal}ViewModel>();

  @override
  void initState() {
    super.initState();
    viewModel.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: Obx(() {
        if (viewModel.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }
        if (viewModel.errorMessage.value != null) {
          return Center(child: Text(viewModel.errorMessage.value!));
        }
        return const Center(child: Text('${pascal} View with GetX!'));
      }),
      floatingActionButton: FloatingActionButton(
        onPressed: viewModel.fetch${pascal}Data,
        child: const Icon(Icons.refresh),
      ),
    );
  }
}
`
            );
        }
    } else if (stateMgmt === 'Riverpod') {
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            fs.writeFileSync(
                vmPath,
                `import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:dio/dio.dart';
import 'package:${packageName}/core/di/injection.dart';
${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

part '${name}_viewmodel.g.dart';

class ${pascal}State {
  final bool isLoading;
  final bool isSuccess;
  final String? message;
${models.map(m => `  final ${m.modelNamePascal}Model? ${m.modelNameCamel}Model;`).join('\n')}

  const ${pascal}State({
    this.isLoading = false,
    this.isSuccess = false,
    this.message,
${models.map(m => `    this.${m.modelNameCamel}Model,`).join('\n')}
  });

  ${pascal}State copyWith({
    bool? isLoading,
    bool? isSuccess,
    String? message,
${models.map(m => `    ${m.modelNamePascal}Model? ${m.modelNameCamel}Model,`).join('\n')}
  }) {
    return ${pascal}State(
      isLoading: isLoading ?? this.isLoading,
      isSuccess: isSuccess ?? this.isSuccess,
      message: message ?? this.message,
${models.map(m => `      ${m.modelNameCamel}Model: ${m.modelNameCamel}Model ?? this.${m.modelNameCamel}Model,`).join('\n')}
    );
  }
}

@riverpod
class ${pascal}ViewModel extends _\$${pascal}ViewModel {
  @override
  ${pascal}State build() {
    return const ${pascal}State();
  }

  Future<void> fetch${pascal}Data() async {
    state = state.copyWith(isLoading: true, isSuccess: false);
    try {
      final results = await Future.wait([
        ${models.map(m => `getIt<${m.modelNamePascal}ApiService>().get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
      state = state.copyWith(
        isLoading: false,
        isSuccess: true,
        ${models.map((m, idx) => `${m.modelNameCamel}Model: results[${idx}] as ${m.modelNamePascal}Model?,`).join('\n        ')}
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, isSuccess: false, message: e.toString());
    }
  }

  Future<void> ${name}Featured() async {
    await fetch${pascal}Data();
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends ConsumerStatefulWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  ConsumerState<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends ConsumerState<${pascal}View> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(${camel}ViewModelProvider.notifier).fetch${pascal}Data();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(${camel}ViewModelProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.message != null
              ? Center(child: Text(state.message!))
              : const Center(child: Text('${pascal} Screen')),
    );
  }
}
`
            );
        }
    } else {
        // Default MVVM (ChangeNotifier)
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            const vmInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
            const vmInjectableAnnot = useInjectable ? "@injectable\n" : "";
            const vmConstructorArgs = models.map(m => `this.${m.modelNameCamel}ApiService`).join(', ');
            const vmConstructor = models.length > 0
                ? `  ${pascal}ViewModel(${vmConstructorArgs});`
                : `  ${pascal}ViewModel();`;

            fs.writeFileSync(
                vmPath,
                `import 'package:flutter/material.dart';
${vmInjectableImport}${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';\nimport '../services/${m.modelNameSnake}_api_service.dart';`).join('\n')}

${vmInjectableAnnot}class ${pascal}ViewModel extends ChangeNotifier {
${models.map(m => `  final ${m.modelNamePascal}ApiService ${m.modelNameCamel}ApiService;`).join('\n')}

${vmConstructor}

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  Future<void> fetch${pascal}Data() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await Future.wait([
        ${models.map(m => `${m.modelNameCamel}ApiService.get${m.modelNamePascal}(),`).join('\n        ')}
      ]);
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> ${name}Featured() async {
    await fetch${pascal}Data();
  }
}
`
            );
        }

        const viewPath = path.join(viewsDir, `${name}_view.dart`);
        if (!skipPageIfExists || !fs.existsSync(viewPath) || fs.readFileSync(viewPath, 'utf8').trim() === '') {
            fs.writeFileSync(
                viewPath,
                `import 'package:flutter/material.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends StatefulWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  State<${pascal}View> createState() => _${pascal}ViewState();
}

class _${pascal}ViewState extends State<${pascal}View> {
  final ${pascal}ViewModel viewModel = getIt<${pascal}ViewModel>();

  @override
  void initState() {
    super.initState();
    viewModel.fetch${pascal}Data();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: viewModel,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(title: const Text('${pascal}')),
          body: viewModel.isLoading
              ? const Center(child: CircularProgressIndicator())
              : viewModel.errorMessage != null
                  ? Center(child: Text(viewModel.errorMessage!))
                  : const Center(child: Text('${pascal} Screen')),
        );
      },
    );
  }
}
`
            );
        }
    }
}

export async function addCleanArchApiAction(
    rootPath: string,
    featureName: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string,
    httpMethod: string,
    endpoint: string,
    stateMgmt: string,
    packageName: string,
    responseModel: FeatureModel | null = null
) {
    const featDir = path.join(rootPath, 'lib', 'features', featureName);
    const dataDir = path.join(featDir, 'data');
    const domainDir = path.join(featDir, 'domain');
    const presDir = path.join(featDir, 'presentation');

    if (responseModel) {
        const modelDir = path.join(dataDir, 'models');
        fs.mkdirSync(modelDir, { recursive: true });
        const modelPath = path.join(modelDir, `${toSnakeCase(actionCamel)}_response_model.dart`);
        const modelPropertiesDecl = responseModel.properties.map(p => `    required ${p.type} ${p.name},`).join('\n');
        fs.writeFileSync(
            modelPath,
            `import 'package:freezed_annotation/freezed_annotation.dart';

part '${toSnakeCase(actionCamel)}_response_model.freezed.dart';
part '${toSnakeCase(actionCamel)}_response_model.g.dart';

@freezed
abstract class ${actionPascal}ResponseModel with _\$${actionPascal}ResponseModel {
  const factory ${actionPascal}ResponseModel({
${modelPropertiesDecl}
  }) = _${actionPascal}ResponseModel;

  factory ${actionPascal}ResponseModel.fromJson(Map<String, dynamic> json) => _\$${actionPascal}ResponseModelFromJson(json);
}
`
        );
    }

    // 1. Remote Data Source
    const dsPath = path.join(dataDir, 'datasources', `${featureName}_remote_data_source.dart`);
    if (fs.existsSync(dsPath)) {
        let content = fs.readFileSync(dsPath, 'utf8');
        const abstractClassTag = `abstract class ${featurePascal}RemoteDataSource {`;
        const abstractMethod = `  Future<void> ${actionCamel}();\n`;
        content = content.replace(abstractClassTag, `${abstractClassTag}\n${abstractMethod}`);

        const concreteClassTag = `class ${featurePascal}RemoteDataSourceImpl implements ${featurePascal}RemoteDataSource {`;
        const concreteMethod = `  @override
  Future<void> ${actionCamel}() async {
    try {
      await dio.${httpMethod.toLowerCase()}Request('${endpoint}');
    } catch (e) {
      throw Exception("Failed to execute ${actionCamel}: \$e");
    }
  }\n`;
        content = content.replace(concreteClassTag, `${concreteClassTag}\n${concreteMethod}`);
        fs.writeFileSync(dsPath, content);
    }

    // 2. Repository Contract
    const repoPath = path.join(domainDir, 'repositories', `${featureName}_repository.dart`);
    if (fs.existsSync(repoPath)) {
        let content = fs.readFileSync(repoPath, 'utf8');
        const classTag = `abstract class ${featurePascal}Repository {`;
        const method = `  Future<void> ${actionCamel}();\n`;
        content = content.replace(classTag, `${classTag}\n${method}`);
        fs.writeFileSync(repoPath, content);
    }

    // 3. Repository Implementation
    const repoImplPath = path.join(dataDir, 'repositories', `${featureName}_repository_impl.dart`);
    if (fs.existsSync(repoImplPath)) {
        let content = fs.readFileSync(repoImplPath, 'utf8');
        const classTag = `class ${featurePascal}RepositoryImpl implements ${featurePascal}Repository {`;
        const method = `  @override
  Future<void> ${actionCamel}() async {
    await remoteDataSource.${actionCamel}();
  }\n`;
        content = content.replace(classTag, `${classTag}\n${method}`);
        fs.writeFileSync(repoImplPath, content);
    }

    // 4. Usecase file
    const ucPath = path.join(domainDir, 'usecases', `${toSnakeCase(actionCamel)}_usecase.dart`);
    const useInjectable = isInjectableEnabled(rootPath);
    const ucInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
    const ucInjectableAnnot = useInjectable ? "@lazySingleton\n" : "";
    const ucContent = `${ucInjectableImport}import '../repositories/${featureName}_repository.dart';

${ucInjectableAnnot}class ${actionPascal}UseCase {
  final ${featurePascal}Repository repository;

  ${actionPascal}UseCase(this.repository);

  Future<void> execute() {
    return repository.${actionCamel}();
  }
}
`;
    fs.writeFileSync(ucPath, ucContent);

    // 5. Register in injection.dart
    const diPath = path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
    if (fs.existsSync(diPath)) {
        let content = fs.readFileSync(diPath, 'utf8');
        const importLine = `import 'package:${packageName}/features/${featureName}/domain/usecases/${toSnakeCase(actionCamel)}_usecase.dart';\n`;
        if (!content.includes(importLine)) {
            content = importLine + content;
        }
        const regTag = `// Features register tag (DO NOT REMOVE)`;
        const regCode = `  getIt.registerLazySingleton<${actionPascal}UseCase>(
    () => ${actionPascal}UseCase(getIt<${featurePascal}Repository>()),
  );\n`;
        content = content.replace(regTag, regCode + '  ' + regTag);
        fs.writeFileSync(diPath, content);
    }

    // 6. State Management
    if (stateMgmt === 'BLoC') {
        const eventPath = path.join(presDir, 'bloc', `${featureName}_event.dart`);
        if (fs.existsSync(eventPath)) {
            let content = fs.readFileSync(eventPath, 'utf8');
            content += `\nclass Execute${actionPascal}Event extends ${featurePascal}Event {}\n`;
            fs.writeFileSync(eventPath, content);
        }

        const statePath = path.join(presDir, 'bloc', `${featureName}_state.dart`);
        if (fs.existsSync(statePath)) {
            let content = fs.readFileSync(statePath, 'utf8');
            content += `\nclass ${actionPascal}LoadingState extends ${featurePascal}State {}\n`;
            content += `\nclass ${actionPascal}SuccessState extends ${featurePascal}State {}\n`;
            content += `\nclass ${actionPascal}ErrorState extends ${featurePascal}State {\n  final String errorMessage;\n  ${actionPascal}ErrorState(this.errorMessage);\n}\n`;
            fs.writeFileSync(statePath, content);
        }

        const blocPath = path.join(presDir, 'bloc', `${featureName}_bloc.dart`);
        if (fs.existsSync(blocPath)) {
            let content = fs.readFileSync(blocPath, 'utf8');
            if (!content.includes("import 'package:get_it/get_it.dart';") && !content.includes(`import 'package:${packageName}/core/di/injection.dart';`)) {
                content = `import 'package:${packageName}/core/di/injection.dart';\n` + content;
            }
            content = `import 'package:${packageName}/features/${featureName}/domain/usecases/${toSnakeCase(actionCamel)}_usecase.dart';\n` + content;

            const searchConstructorTag = ` : super(${featurePascal}Initial()) {`;
            const handlerCode = `\n    on<Execute${actionPascal}Event>((event, emit) async {
      try {
        emit(${actionPascal}LoadingState());
        await getIt<${actionPascal}UseCase>().execute();
        emit(${actionPascal}SuccessState());
      } catch (e) {
        emit(${actionPascal}ErrorState(e.toString()));
      }
    });\n`;
            content = content.replace(searchConstructorTag, ` : super(${featurePascal}Initial()) {${handlerCode}`);
            fs.writeFileSync(blocPath, content);
        }
    } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
        const controllerPath = path.join(presDir, 'controllers', `${featureName}_controller.dart`);
        if (fs.existsSync(controllerPath)) {
            let content = fs.readFileSync(controllerPath, 'utf8');
            const importLine = `import 'package:${packageName}/features/${featureName}/domain/usecases/${toSnakeCase(actionCamel)}_usecase.dart';\n`;
            if (!content.includes(importLine)) {
                content = importLine + content;
            }

            const isGetX = stateMgmt === 'GetX';
            const errorAssign = isGetX ? 'errorMessage.value' : 'errorMessage.value';
            const methodCode = `\n  Future<void> ${actionCamel}() async {
    try {
      ${errorAssign} = null;
      await getIt<${actionPascal}UseCase>().execute();
    } catch (e) {
      ${errorAssign} = e.toString();
    }
  }\n`;

            const classTag = new RegExp(`(class ${featurePascal}Controller[^{]*\\{)`);
            if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                content = content.replace(classTag, `$1${methodCode}`);
                if (!content.includes("import 'package:get_it/get_it.dart';") && !content.includes(`import 'package:${packageName}/core/di/injection.dart';`)) {
                    content = `import 'package:${packageName}/core/di/injection.dart';\n` + content;
                }
                fs.writeFileSync(controllerPath, content);
            }
        }
    } else if (stateMgmt === 'Provider') {
        const notifierPath = path.join(presDir, 'provider', `${featureName}_notifier.dart`);
        if (fs.existsSync(notifierPath)) {
            let content = fs.readFileSync(notifierPath, 'utf8');
            const importLine = `import 'package:${packageName}/features/${featureName}/domain/usecases/${toSnakeCase(actionCamel)}_usecase.dart';\n`;
            if (!content.includes(importLine)) {
                content = importLine + content;
            }
            if (!content.includes("import 'package:get_it/get_it.dart';") && !content.includes(`import 'package:${packageName}/core/di/injection.dart';`)) {
                content = `import 'package:${packageName}/core/di/injection.dart';\n` + content;
            }

            const methodCode = `\n  Future<void> ${actionCamel}() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await getIt<${actionPascal}UseCase>().execute();
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }\n`;

            const classTag = new RegExp(`(class ${featurePascal}Notifier[^{]*\\{)`);
            if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                content = content.replace(classTag, `$1${methodCode}`);
                fs.writeFileSync(notifierPath, content);
            }
        }
    } else {
        const providerPath = path.join(presDir, 'riverpod', `${featureName}_provider.dart`);
        if (fs.existsSync(providerPath)) {
            let content = fs.readFileSync(providerPath, 'utf8');
            content = `import 'package:${packageName}/features/${featureName}/domain/usecases/${toSnakeCase(actionCamel)}_usecase.dart';\n` + content;
            
            const classTag = `class ${featurePascal}Notifier extends _\$${featurePascal}Notifier {`;
            const methodCode = `  Future<void> ${actionCamel}() async {
    state = const AsyncValue.loading();
    try {
      await getIt<${actionPascal}UseCase>().execute();
      ref.invalidateSelf();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }\n`;
            content = content.replace(classTag, `${classTag}\n${methodCode}`);
            fs.writeFileSync(providerPath, content);
        }
    }
}

export async function addMvvmApiAction(
    rootPath: string,
    featureName: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string,
    httpMethod: string,
    endpoint: string,
    stateMgmt: string,
    packageName: string,
    responseModel: FeatureModel | null = null,
    isMvc = false
) {
    const featDir = path.join(rootPath, 'lib', 'features', featureName);
    const vmDir = path.join(featDir, isMvc ? 'controllers' : 'viewmodels');
    const vmFileName = isMvc ? `${featureName}_controller.dart` : `${featureName}_viewmodel.dart`;
    const vmClassName = isMvc ? `${featurePascal}Controller` : `${featurePascal}ViewModel`;
    const modelsDir = path.join(featDir, 'models');
    const servicesDir = path.join(featDir, 'services');

    if (responseModel) {
        fs.mkdirSync(modelsDir, { recursive: true });
        const modelPath = path.join(modelsDir, `${toSnakeCase(actionCamel)}_response_model.dart`);
        const modelPropertiesDecl = responseModel.properties.map(p => {
            const camelName = toCamelCase(p.name);
            if (camelName !== p.name) {
                return `    @JsonKey(name: '${p.name}') required ${p.type} ${camelName},`;
            }
            return `    required ${p.type} ${p.name},`;
        }).join('\n');

        fs.writeFileSync(
            modelPath,
            `import 'package:freezed_annotation/freezed_annotation.dart';

part '${toSnakeCase(actionCamel)}_response_model.freezed.dart';
part '${toSnakeCase(actionCamel)}_response_model.g.dart';

@freezed
abstract class ${actionPascal}ResponseModel with _\$${actionPascal}ResponseModel {
  const factory ${actionPascal}ResponseModel({
${modelPropertiesDecl}
  }) = _${actionPascal}ResponseModel;

  factory ${actionPascal}ResponseModel.fromJson(Map<String, dynamic> json) => _\$${actionPascal}ResponseModelFromJson(json);
}
`
        );

        fs.mkdirSync(servicesDir, { recursive: true });
        const servicePath = path.join(servicesDir, `${toSnakeCase(actionCamel)}_api_service.dart`);
        const useInjectable = isInjectableEnabled(rootPath);
        const serviceInjectableImport = useInjectable ? "import 'package:injectable/injectable.dart';\n" : "";
        const serviceInjectableAnnot = useInjectable ? `@LazySingleton(as: ${actionPascal}ResponseModelApiService)\n` : "";
        fs.writeFileSync(
            servicePath,
            `${serviceInjectableImport}import 'package:dio/dio.dart';
import '../models/${toSnakeCase(actionCamel)}_response_model.dart';

abstract class ${actionPascal}ResponseModelApiService {
  Future<${actionPascal}ResponseModel> get${actionPascal}ResponseModel();
}

${serviceInjectableAnnot}class ${actionPascal}ResponseModelApiServiceImpl implements ${actionPascal}ResponseModelApiService {
  final Dio dio;

  ${actionPascal}ResponseModelApiServiceImpl(this.dio);

  @override
  Future<${actionPascal}ResponseModel> get${actionPascal}ResponseModel() async {
    final response = await dio.${httpMethod.toLowerCase()}('${endpoint}');
    return ${actionPascal}ResponseModel.fromJson(response.data as Map<String, dynamic>);
  }
}
`
        );

        const diPath = path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
        if (fs.existsSync(diPath)) {
            let content = fs.readFileSync(diPath, 'utf8');
            const serviceImport = `import 'package:${packageName}/features/${featureName}/services/${toSnakeCase(actionCamel)}_api_service.dart';\n`;
            if (!content.includes(serviceImport)) {
                content = serviceImport + content;
            }
            const regTag = `// Features register tag (DO NOT REMOVE)`;
            const regCode = `  getIt.registerLazySingleton<${actionPascal}ResponseModelApiService>(
    () => ${actionPascal}ResponseModelApiServiceImpl(getIt<Dio>()),
  );\n`;
            if (!content.includes(`${actionPascal}ResponseModelApiService`)) {
                content = content.replace(regTag, regCode + '  ' + regTag);
                fs.writeFileSync(diPath, content);
            }
        }
    }

    if (stateMgmt === 'BLoC') {
        const vmPath = path.join(vmDir, vmFileName);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            const searchConstructor = `  ${vmClassName}(`;
            const methodCode = `\n  Future<void> ${actionCamel}() async {
    emit(${featurePascal}Loading());
    try {
      final dio = getIt<Dio>();
      await dio.${httpMethod.toLowerCase()}('${endpoint}');
      await fetch${featurePascal}Data();
    } catch (e) {
      emit(${featurePascal}Error(e.toString()));
    }
  }\n`;
            if (content.includes(searchConstructor)) {
                const idx = content.indexOf(searchConstructor);
                const braceIdx = content.indexOf('{', idx);
                if (braceIdx !== -1) {
                    content = content.slice(0, braceIdx + 1) + methodCode + content.slice(braceIdx + 1);
                    fs.writeFileSync(vmPath, content);
                }
            }
        }
    } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
        const vmPath = path.join(vmDir, vmFileName);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            const searchConstructor = `  ${vmClassName}(`;
            const methodCode = `\n  Future<void> ${actionCamel}() async {
    try {
      final dio = getIt<Dio>();
      await dio.${httpMethod.toLowerCase()}('${endpoint}');
      await fetch${featurePascal}Data();
    } catch (e) {
      errorMessage.value = e.toString();
    }
  }\n`;
            if (content.includes(searchConstructor) && !content.includes(`Future<void> ${actionCamel}()`)) {
                if (!content.includes("import 'package:get_it/get_it.dart';") && !content.includes(`import 'package:${packageName}/core/di/injection.dart';`)) {
                    content = `import 'package:${packageName}/core/di/injection.dart';\n` + content;
                }
                const idx = content.indexOf(searchConstructor);
                const semicolonIdx = content.indexOf(';', idx);
                if (semicolonIdx !== -1) {
                    content = content.slice(0, semicolonIdx + 1) + methodCode + content.slice(semicolonIdx + 1);
                    fs.writeFileSync(vmPath, content);
                }
            }
        }
    } else if (stateMgmt === 'Provider') {
        const vmPath = path.join(vmDir, vmFileName);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            if (!content.includes("import 'package:dio/dio.dart';")) {
                content = "import 'package:dio/dio.dart';\n" + content;
            }
            if (!content.includes("import 'package:get_it/get_it.dart';") && !content.includes(`import 'package:${packageName}/core/di/injection.dart';`)) {
                content = `import 'package:${packageName}/core/di/injection.dart';\n` + content;
            }
            const methodCode = `\n  Future<void> ${actionCamel}() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final dio = getIt<Dio>();
      await dio.${httpMethod.toLowerCase()}('${endpoint}');
      await fetch${featurePascal}Data();
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }\n`;
            const classTag = new RegExp(`(class ${vmClassName}[^{]*\\{)`);
            if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                content = content.replace(classTag, `$1${methodCode}`);
                fs.writeFileSync(vmPath, content);
            }
        }
    } else {
        const vmPath = path.join(vmDir, vmFileName);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            const classTag = `class ${vmClassName} extends _\$${vmClassName} {`;
            
            let methodCode = '';
            if (responseModel) {
                const responseImport = `import '../models/${toSnakeCase(actionCamel)}_response_model.dart';\n`;
                const serviceImport = `import '../services/${toSnakeCase(actionCamel)}_api_service.dart';\n`;
                if (!content.includes(responseImport)) content = responseImport + content;
                if (!content.includes(serviceImport)) content = serviceImport + content;

                methodCode = `  Future<void> ${actionCamel}() async {
    state = state.copyWith(isLoading: true, isSuccess: false);
    try {
      final response = await getIt<${actionPascal}ResponseModelApiService>().get${actionPascal}ResponseModel();
      state = state.copyWith(
        isLoading: false,
        isSuccess: true,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, isSuccess: false, message: e.toString());
    }
  }\n`;
            } else {
                methodCode = `  Future<void> ${actionCamel}() async {
    state = state.copyWith(isLoading: true, isSuccess: false);
    try {
      final dio = getIt<Dio>();
      await dio.${httpMethod.toLowerCase()}('${endpoint}');
      await fetch${featurePascal}Data();
    } catch (e) {
      state = state.copyWith(isLoading: false, isSuccess: false, message: e.toString());
    }
  }\n`;
            }

            if (content.includes(classTag)) {
                content = content.replace(classTag, `${classTag}\n${methodCode}`);
                fs.writeFileSync(vmPath, content);
            }
        }
    }

    await runBuildRunner(rootPath);
}

export async function addLocalStateAction(
    rootPath: string,
    featureName: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string,
    stateMgmt: string,
    arch: string,
    packageName: string
) {
    const featDir = path.join(rootPath, 'lib', 'features', featureName);
    const presDir = path.join(featDir, 'presentation');
    const vmDir = path.join(featDir, 'viewmodels');

    if (arch.includes('Clean')) {
        if (stateMgmt === 'BLoC') {
            const eventPath = path.join(presDir, 'bloc', `${featureName}_event.dart`);
            if (fs.existsSync(eventPath)) {
                let content = fs.readFileSync(eventPath, 'utf8');
                content += `\nclass Execute${actionPascal}Event extends ${featurePascal}Event {}\n`;
                fs.writeFileSync(eventPath, content);
            }

            const statePath = path.join(presDir, 'bloc', `${featureName}_state.dart`);
            if (fs.existsSync(statePath)) {
                let content = fs.readFileSync(statePath, 'utf8');
                content += `\nclass ${actionPascal}LoadingState extends ${featurePascal}State {}\n`;
                content += `\nclass ${actionPascal}SuccessState extends ${featurePascal}State {}\n`;
                content += `\nclass ${actionPascal}ErrorState extends ${featurePascal}State {\n  final String errorMessage;\n  ${actionPascal}ErrorState(this.errorMessage);\n}\n`;
                fs.writeFileSync(statePath, content);
            }

            const blocPath = path.join(presDir, 'bloc', `${featureName}_bloc.dart`);
            if (fs.existsSync(blocPath)) {
                let content = fs.readFileSync(blocPath, 'utf8');
                const searchConstructorTag = ` : super(${featurePascal}Initial()) {`;
                const handlerCode = `\n    on<Execute${actionPascal}Event>((event, emit) async {
      try {
        emit(${actionPascal}LoadingState());
        // TODO: Implement local action logic here
        emit(${actionPascal}SuccessState());
      } catch (e) {
        emit(${actionPascal}ErrorState(e.toString()));
      }
    });\n`;
                content = content.replace(searchConstructorTag, ` : super(${featurePascal}Initial()) {${handlerCode}`);
                fs.writeFileSync(blocPath, content);
            }
        } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
            const controllerPath = path.join(presDir, 'controllers', `${featureName}_controller.dart`);
            if (fs.existsSync(controllerPath)) {
                let content = fs.readFileSync(controllerPath, 'utf8');
                const methodCode = `\n  Future<void> ${actionCamel}() async {
    try {
      errorMessage.value = null;
      // TODO: Implement local action logic here
    } catch (e) {
      errorMessage.value = e.toString();
    }
  }\n`;
                const classTag = new RegExp(`(class ${featurePascal}Controller[^{]*\\{)`);
                if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                    content = content.replace(classTag, `$1${methodCode}`);
                    fs.writeFileSync(controllerPath, content);
                }
            }
        } else if (stateMgmt === 'Provider') {
            const notifierPath = path.join(presDir, 'provider', `${featureName}_notifier.dart`);
            if (fs.existsSync(notifierPath)) {
                let content = fs.readFileSync(notifierPath, 'utf8');
                const methodCode = `\n  Future<void> ${actionCamel}() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      // TODO: Implement local action logic here
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }\n`;
                const classTag = new RegExp(`(class ${featurePascal}Notifier[^{]*\\{)`);
                if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                    content = content.replace(classTag, `$1${methodCode}`);
                    fs.writeFileSync(notifierPath, content);
                }
            }
        } else {
            const providerPath = path.join(presDir, 'riverpod', `${featureName}_provider.dart`);
            if (fs.existsSync(providerPath)) {
                let content = fs.readFileSync(providerPath, 'utf8');
                const classTag = `class ${featurePascal}Notifier extends _\$${featurePascal}Notifier {`;
                const methodCode = `  Future<void> ${actionCamel}() async {
    state = const AsyncValue.loading();
    try {
      // TODO: Implement local action logic here
      ref.invalidateSelf();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }\n`;
                content = content.replace(classTag, `${classTag}\n${methodCode}`);
                fs.writeFileSync(providerPath, content);
            }
        }
    } else {
        // MVC or MVVM
        const isMvc = arch.includes('MVC');
        const targetDir = path.join(featDir, isMvc ? 'controllers' : 'viewmodels');
        const targetFileName = isMvc ? `${featureName}_controller.dart` : `${featureName}_viewmodel.dart`;
        const targetClassName = isMvc ? `${featurePascal}Controller` : `${featurePascal}ViewModel`;
        const targetPath = path.join(targetDir, targetFileName);

        if (stateMgmt === 'BLoC') {
            if (fs.existsSync(targetPath)) {
                let content = fs.readFileSync(targetPath, 'utf8');
                const classTag = `class ${targetClassName} extends Cubit<${featurePascal}State> {`;
                const stateDecl = `class ${actionPascal}LoadingState extends ${featurePascal}State {}\n` +
                                  `class ${actionPascal}SuccessState extends ${featurePascal}State {}\n` +
                                  `class ${actionPascal}ErrorState extends ${featurePascal}State {\n  final String errorMessage;\n  ${actionPascal}ErrorState(this.errorMessage);\n}\n\n`;
                const methodCode = `\n  Future<void> ${actionCamel}() async {
    emit(${actionPascal}LoadingState());
    try {
      // TODO: Implement local action logic here
      emit(${actionPascal}SuccessState());
    } catch (e) {
      emit(${actionPascal}ErrorState(e.toString()));
    }
  }\n`;
                content = content.replace(classTag, `${stateDecl}${classTag}\n${methodCode}`);
                fs.writeFileSync(targetPath, content);
            }
        } else if (stateMgmt === 'PureBind' || stateMgmt === 'GetX') {
            if (fs.existsSync(targetPath)) {
                let content = fs.readFileSync(targetPath, 'utf8');
                const methodCode = `\n  Future<void> ${actionCamel}() async {
    try {
      errorMessage.value = null;
      // TODO: Implement local action logic here
    } catch (e) {
      errorMessage.value = e.toString();
    }
  }\n`;
                const searchConstructor = `  ${targetClassName}(`;
                if (content.includes(searchConstructor) && !content.includes(`Future<void> ${actionCamel}()`)) {
                    const idx = content.indexOf(searchConstructor);
                    const semicolonIdx = content.indexOf(';', idx);
                    if (semicolonIdx !== -1) {
                        content = content.slice(0, semicolonIdx + 1) + methodCode + content.slice(semicolonIdx + 1);
                        fs.writeFileSync(targetPath, content);
                    }
                }
            }
        } else if (stateMgmt === 'Provider') {
            if (fs.existsSync(targetPath)) {
                let content = fs.readFileSync(targetPath, 'utf8');
                const methodCode = `\n  Future<void> ${actionCamel}() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      // TODO: Implement local action logic here
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }\n`;
                const classTag = new RegExp(`(class ${targetClassName}[^{]*\\{)`);
                if (classTag.test(content) && !content.includes(`Future<void> ${actionCamel}()`)) {
                    content = content.replace(classTag, `$1${methodCode}`);
                    fs.writeFileSync(targetPath, content);
                }
            }
        } else {
            // Riverpod
            if (fs.existsSync(targetPath)) {
                let content = fs.readFileSync(targetPath, 'utf8');
                const classTag = `class ${targetClassName} extends _\$${targetClassName} {`;
                const methodCode = `  Future<void> ${actionCamel}() async {
    state = const AsyncValue.loading();
    try {
      // TODO: Implement local action logic here
      ref.invalidateSelf();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }\n`;
                content = content.replace(classTag, `${classTag}\n${methodCode}`);
                fs.writeFileSync(targetPath, content);
            }
        }
    }
}

function configurePubspecForEnvAndL10n(rootPath: string) {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return;

    let content = fs.readFileSync(pubspecPath, 'utf8');

    // 1. Add flutter_localizations under dependencies
    if (!content.includes('flutter_localizations:')) {
        content = content.replace(/^dependencies:/m, `dependencies:\n  flutter_localizations:\n    sdk: flutter`);
    }

    // 2. Ensure flutter: block exists and insert generate: true / assets correctly
    if (!/^flutter:/m.test(content)) {
        content += `\nflutter:\n  generate: true\n  assets:\n    - .env\n`;
    } else {
        if (!content.includes('generate: true')) {
            content = content.replace(/^flutter:/m, `flutter:\n  generate: true`);
        }
        if (!content.includes('.env')) {
            if (/^\s*assets:/m.test(content)) {
                content = content.replace(/^\s*assets:/m, `  assets:\n    - .env`);
            } else {
                content = content.replace(/^flutter:/m, `flutter:\n  assets:\n    - .env`);
            }
        }
    }

    fs.writeFileSync(pubspecPath, content);
}

export function generateEnvFile(rootPath: string) {
    const envPath = path.join(rootPath, '.env');
    if (!fs.existsSync(envPath)) {
        const envTemplate = `API_BASE_URL=https://api.yourdomain.com/v1/
APP_NAME=Flutter Config App
`;
        fs.writeFileSync(envPath, envTemplate);
    }

    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        let content = fs.readFileSync(gitignorePath, 'utf8');
        if (!content.includes('.env')) {
            content += '\n# Local Environment\n.env\n';
            fs.writeFileSync(gitignorePath, content);
        }
    }
}

export function generateL10nConfig(rootPath: string) {
    const l10nYamlPath = path.join(rootPath, 'l10n.yaml');
    if (!fs.existsSync(l10nYamlPath)) {
        const l10nYamlTemplate = `arb-dir: lib/l10n
template-arb-file: app_en.arb
output-class: AppLocalizations
`;
        fs.writeFileSync(l10nYamlPath, l10nYamlTemplate);
    }

    const l10nDir = path.join(rootPath, 'lib', 'l10n');
    fs.mkdirSync(l10nDir, { recursive: true });

    const enArbPath = path.join(l10nDir, 'app_en.arb');
    if (!fs.existsSync(enArbPath)) {
        const enArbTemplate = `{
  "@@locale": "en",
  "appTitle": "Flutter Config App",
  "@appTitle": {
    "description": "The title of the application"
  },
  "welcomeMessage": "Welcome to our Flutter Application!",
  "@welcomeMessage": {
    "description": "A welcome message shown to the user"
  }
}
`;
        fs.writeFileSync(enArbPath, enArbTemplate);
    }

    const esArbPath = path.join(l10nDir, 'app_es.arb');
    if (!fs.existsSync(esArbPath)) {
        const esArbTemplate = `{
  "@@locale": "es",
  "appTitle": "Aplicación Flutter Config",
  "welcomeMessage": "¡Bienvenido a nuestra aplicación Flutter!"
}
`;
        fs.writeFileSync(esArbPath, esArbTemplate);
    }

    // Generate BuildContext extensions for easy localization access (e.g. context.l10n.appTitle)
    const localizationCoreDir = path.join(rootPath, 'lib', 'core', 'localization');
    fs.mkdirSync(localizationCoreDir, { recursive: true });
    const extPath = path.join(localizationCoreDir, 'l10n_extensions.dart');
    if (!fs.existsSync(extPath)) {
        const extTemplate = `import 'package:flutter/widgets.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

extension AppLocalizationsX on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
`;
        fs.writeFileSync(extPath, extTemplate);
    }
}

function updateMainDartForEnv(rootPath: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add import
    const importDotenv = "import 'package:flutter_dotenv/flutter_dotenv.dart';";
    if (!content.includes(importDotenv)) {
        content = `${importDotenv}\n` + content;
    }

    // Update main function to load env
    const ensureInitLine = content.includes('WidgetsFlutterBinding.ensureInitialized();') ? '' : '\n  WidgetsFlutterBinding.ensureInitialized();';
    if (content.includes('void main() {')) {
        content = content.replace('void main() {', `void main() async {${ensureInitLine}\n  await dotenv.load(fileName: ".env");`);
    } else if (content.includes('void main() async {')) {
        if (!content.includes('dotenv.load')) {
            content = content.replace('void main() async {', `void main() async {${ensureInitLine}\n  await dotenv.load(fileName: ".env");`);
        }
    }

    fs.writeFileSync(mainPath, content);
}

function updateMainDartForLocalization(rootPath: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add imports
    const importL10n = "import 'package:flutter_localizations/flutter_localizations.dart';\nimport 'package:flutter_gen/gen_l10n/app_localizations.dart';";
    if (!content.includes('flutter_localizations.dart')) {
        content = `${importL10n}\n` + content;
    }

    // Add delegates and supportedLocales inside MaterialApp.router or MaterialApp
    const delegatesSnippet = `          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('en', ''),
            Locale('es', ''),
          ],`;

    if (!content.includes('localizationsDelegates')) {
        if (content.includes('MaterialApp.router(')) {
            content = content.replace('MaterialApp.router(', `MaterialApp.router(\n${delegatesSnippet}`);
        } else if (content.includes('MaterialApp(')) {
            content = content.replace('MaterialApp(', `MaterialApp(\n${delegatesSnippet}`);
        }
    }

    fs.writeFileSync(mainPath, content);
}

function configureAndroidManifestForNotifications(rootPath: string) {
    const manifestPath = path.join(rootPath, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    if (!fs.existsSync(manifestPath)) return;

    let content = fs.readFileSync(manifestPath, 'utf8');

    // Add default notification channel metadata inside <application>
    const metaDataChannel = `\n        <meta-data\n            android:name="com.google.firebase.messaging.default_notification_channel_id"\n            android:value="high_importance_channel" />`;

    if (!content.includes('com.google.firebase.messaging.default_notification_channel_id')) {
        const appClosingTag = '</application>';
        content = content.replace(appClosingTag, `${metaDataChannel}\n    ${appClosingTag}`);
    }

    fs.writeFileSync(manifestPath, content);
}

function configureInfoPlistForNotifications(rootPath: string) {
    const plistPath = path.join(rootPath, 'ios', 'Runner', 'Info.plist');
    if (!fs.existsSync(plistPath)) return;

    let content = fs.readFileSync(plistPath, 'utf8');

    // Add background modes for remote notifications
    const backgroundModesSnippet = `
	<key>UIBackgroundModes</key>
	<array>
		<string>fetch</string>
		<string>remote-notification</string>
	</array>`;

    if (!content.includes('UIBackgroundModes')) {
        const dictClosingTag = '</dict>';
        const lastDictIndex = content.lastIndexOf(dictClosingTag);
        if (lastDictIndex !== -1) {
            content = content.substring(0, lastDictIndex) + backgroundModesSnippet + '\n' + content.substring(lastDictIndex);
        }
    } else if (!content.includes('remote-notification')) {
        const arrayIndex = content.indexOf('<key>UIBackgroundModes</key>');
        if (arrayIndex !== -1) {
            const nextArrayOpen = content.indexOf('<array>', arrayIndex);
            if (nextArrayOpen !== -1) {
                content = content.substring(0, nextArrayOpen + 7) + '\n\t\t<string>remote-notification</string>' + content.substring(nextArrayOpen + 7);
            }
        }
    }

    fs.writeFileSync(plistPath, content);
}

export function generateNotificationService(rootPath: string) {
    const serviceDir = path.join(rootPath, 'lib', 'core', 'services');
    fs.mkdirSync(serviceDir, { recursive: true });

    const servicePath = path.join(serviceDir, 'notification_service.dart');
    if (!fs.existsSync(servicePath)) {
        const serviceTemplate = `import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotificationsPlugin = FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    // 1. Request permissions
    await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // 2. Initialize local notifications
    const AndroidInitializationSettings androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const InitializationSettings initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotificationsPlugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (NotificationResponse details) {
        // Handle notification tap when app is in foreground/background
        print('Notification tapped: \${details.payload}');
      },
    );

    // 3. Create Android notification channel
    const AndroidNotificationChannel channel = AndroidNotificationChannel(
      'high_importance_channel',
      'High Importance Notifications',
      description: 'This channel is used for important notifications.',
      importance: Importance.max,
    );

    await _localNotificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // 4. Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      RemoteNotification? notification = message.notification;
      AndroidNotification? android = message.notification?.android;

      if (notification != null && android != null) {
        _localNotificationsPlugin.show(
          notification.hashCode,
          notification.title,
          notification.body,
          NotificationDetails(
            android: AndroidNotificationDetails(
              channel.id,
              channel.name,
              channelDescription: channel.description,
              icon: '@mipmap/ic_launcher',
            ),
          ),
          payload: message.data.toString(),
        );
      }
    });

    // 5. Handle background/terminated notification clicks
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('A new onMessageOpenedApp event was published!');
    });

    // Get FCM token
    String? token = await _firebaseMessaging.getToken();
    print("FCM Token: \$token");
  }
}
`;
        fs.writeFileSync(servicePath, serviceTemplate);
    }
}

function updateMainDartForNotifications(rootPath: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add imports
    const imports = "import 'package:firebase_core/firebase_core.dart';\nimport 'core/services/notification_service.dart';";
    if (!content.includes('firebase_core.dart')) {
        content = `${imports}\n` + content;
    }

    // Add initialization to main()
    const initSnippet = `  await Firebase.initializeApp();\n  await NotificationService().initialize();`;
    const ensureInitLine = content.includes('WidgetsFlutterBinding.ensureInitialized();') ? '' : '\n  WidgetsFlutterBinding.ensureInitialized();';
    if (!content.includes('Firebase.initializeApp()')) {
        if (content.includes('void main() {')) {
            content = content.replace('void main() {', `void main() async {${ensureInitLine}\n${initSnippet}`);
        } else if (content.includes('void main() async {')) {
            content = content.replace('void main() async {', `void main() async {${ensureInitLine}\n${initSnippet}`);
        }
    }

    fs.writeFileSync(mainPath, content);
}

export function generateConnectivityFiles(rootPath: string) {
    const serviceDir = path.join(rootPath, 'lib', 'core', 'services');
    fs.mkdirSync(serviceDir, { recursive: true });

    const servicePath = path.join(serviceDir, 'connectivity_service.dart');
    if (!fs.existsSync(servicePath)) {
        const serviceTemplate = `import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

class ConnectivityService {
  static final ConnectivityService _instance = ConnectivityService._internal();
  factory ConnectivityService() => _instance;
  ConnectivityService._internal();

  final Connectivity _connectivity = Connectivity();
  final StreamController<bool> _connectionStreamController = StreamController<bool>.broadcast();

  Stream<bool> get connectionStream => _connectionStreamController.stream;

  void initialize() {
    _connectivity.onConnectivityChanged.listen((List<ConnectivityResult> results) {
      final isConnected = results.any((result) => result != ConnectivityResult.none);
      _connectionStreamController.add(isConnected);
    });
  }

  Future<bool> checkConnection() async {
    final results = await _connectivity.checkConnectivity();
    return results.any((result) => result != ConnectivityResult.none);
  }

  void dispose() {
    _connectionStreamController.close();
  }
}
`;
        fs.writeFileSync(servicePath, serviceTemplate);
    }

    const widgetsDir = path.join(rootPath, 'lib', 'core', 'widgets');
    fs.mkdirSync(widgetsDir, { recursive: true });

    const widgetPath = path.join(widgetsDir, 'no_internet_widget.dart');
    if (!fs.existsSync(widgetPath)) {
        const widgetTemplate = `import 'package:flutter/material.dart';
import '../services/connectivity_service.dart';

class NoInternetWidget extends StatelessWidget {
  final VoidCallback? onRetry;

  const NoInternetWidget({super.key, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.wifi_off_rounded,
                  size: 64,
                  color: Colors.red.shade600,
                ),
              ),
              const SizedBox(height: 24),
              const Text(
                'No Internet Connection',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1F2937),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'It looks like you\\'re offline. Please check your internet settings and try again.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF6B7280),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: () async {
                    final isConnected = await ConnectivityService().checkConnection();
                    if (!context.mounted) return;
                    if (isConnected) {
                      if (onRetry != null) {
                        onRetry!();
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Back online!'),
                            backgroundColor: Colors.green,
                          ),
                        );
                      }
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Still offline. Please check connection.'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: const Text(
                    'Try Again',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
`;
        fs.writeFileSync(widgetPath, widgetTemplate);
    }

    // Generate Connectivity Interceptor for Dio
    const networkDir = path.join(rootPath, 'lib', 'core', 'network');
    fs.mkdirSync(networkDir, { recursive: true });
    const interceptorPath = path.join(networkDir, 'connectivity_interceptor.dart');
    if (!fs.existsSync(interceptorPath)) {
        const interceptorTemplate = `import 'package:dio/dio.dart';
import '../services/connectivity_service.dart';

class ConnectivityInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final isConnected = await ConnectivityService().checkConnection();
    if (!isConnected) {
      return handler.reject(
        DioException(
          requestOptions: options,
          error: 'No internet connection detected.',
          type: DioExceptionType.connectionError,
        ),
      );
    }
    return handler.next(options);
  }
}
`;
        fs.writeFileSync(interceptorPath, interceptorTemplate);
    }

    updateDioForConnectivity(rootPath);
}

export function generateSecurityFiles(rootPath: string) {
    const serviceDir = path.join(rootPath, 'lib', 'core', 'services');
    fs.mkdirSync(serviceDir, { recursive: true });

    // 1. Secure Storage Service
    const secureStoragePath = path.join(serviceDir, 'secure_storage_service.dart');
    if (!fs.existsSync(secureStoragePath)) {
        const secureStorageTemplate = `import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static final SecureStorageService _instance = SecureStorageService._internal();
  factory SecureStorageService() => _instance;
  SecureStorageService._internal();

  final _storage = const FlutterSecureStorage();

  Future<void> write(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  Future<String?> read(String key) async {
    return await _storage.read(key: key);
  }

  Future<void> delete(String key) async {
    await _storage.delete(key: key);
  }

  Future<void> deleteAll() async {
    await _storage.deleteAll();
  }
}
`;
        fs.writeFileSync(secureStoragePath, secureStorageTemplate);
    }

    // 2. Encryption Service (AES-256)
    const encryptionPath = path.join(serviceDir, 'encryption_service.dart');
    if (!fs.existsSync(encryptionPath)) {
        const encryptionTemplate = `import 'package:encrypt/encrypt.dart' as encrypt;

class EncryptionService {
  static final EncryptionService _instance = EncryptionService._internal();
  factory EncryptionService() => _instance;
  EncryptionService._internal();

  // 32-character key for AES-256 (Should be obfuscated or loaded securely)
  final _key = encrypt.Key.fromUtf8('my32characterultrasecretkey12345');
  final _iv = encrypt.IV.fromLength(16);

  String encryptPayload(String plainText) {
    final encrypter = encrypt.Encrypter(encrypt.AES(_key));
    final encrypted = encrypter.encrypt(plainText, iv: _iv);
    return encrypted.base64;
  }

  String decryptPayload(String encryptedBase64) {
    final encrypter = encrypt.Encrypter(encrypt.AES(_key));
    final decrypted = encrypter.decrypt64(encryptedBase64, iv: _iv);
    return decrypted;
  }
}
`;
        fs.writeFileSync(encryptionPath, encryptionTemplate);
    }
}

export function generateHiveFiles(rootPath: string) {
    const serviceDir = path.join(rootPath, 'lib', 'core', 'services');
    fs.mkdirSync(serviceDir, { recursive: true });

    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    let hasInjectable = false;
    if (fs.existsSync(pubspecPath)) {
        const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
        hasInjectable = pubspecContent.includes('injectable:');
    }

    const hiveServicePath = path.join(serviceDir, 'hive_service.dart');
    if (!fs.existsSync(hiveServicePath)) {
        const injectableImport = hasInjectable ? "import 'package:injectable/injectable.dart';\n\n@lazySingleton\n" : "";
        const hiveServiceTemplate = `import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
${injectableImport}class HiveService {
  static final HiveService _instance = HiveService._internal();
  factory HiveService() => _instance;
  HiveService._internal();

  static const String defaultBoxName = 'app_preferences';

  Box? _defaultBox;

  Box get defaultBox {
    if (_defaultBox == null || !_defaultBox!.isOpen) {
      if (Hive.isBoxOpen(defaultBoxName)) {
        _defaultBox = Hive.box(defaultBoxName);
        return _defaultBox!;
      }
      throw StateError(
        'HiveService default box is not initialized. Call HiveService().init() first.',
      );
    }
    return _defaultBox!;
  }

  Future<void> init({String boxName = defaultBoxName}) async {
    await Hive.initFlutter();
    _defaultBox = await openBox(boxName);
  }

  Future<Box<T>> openBox<T>(String boxName) async {
    if (Hive.isBoxOpen(boxName)) {
      return Hive.box<T>(boxName);
    }
    return await Hive.openBox<T>(boxName);
  }

  Box<T> getBox<T>([String? boxName]) {
    final name = boxName ?? defaultBoxName;
    if (!Hive.isBoxOpen(name)) {
      throw StateError('Box "\$name" is not open. Call openBox("\$name") first.');
    }
    return Hive.box<T>(name);
  }

  bool isBoxOpen(String boxName) => Hive.isBoxOpen(boxName);

  void registerAdapter<T>(TypeAdapter<T> adapter) {
    if (!Hive.isAdapterRegistered(adapter.typeId)) {
      Hive.registerAdapter<T>(adapter);
    }
  }

  Future<void> put<T>(dynamic key, T value, {String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.put(key, value);
  }

  T? get<T>(dynamic key, {T? defaultValue, String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.get(key, defaultValue: defaultValue) as T?;
  }

  Future<void> delete(dynamic key, {String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.delete(key);
  }

  bool containsKey(dynamic key, {String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.containsKey(key);
  }

  List<T> getAll<T>({String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.values.cast<T>().toList();
  }

  Map<dynamic, dynamic> toMap({String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.toMap();
  }

  Future<void> clear({String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.clear();
  }

  Future<void> closeBox(String boxName) async {
    if (Hive.isBoxOpen(boxName)) {
      await Hive.box(boxName).close();
    }
  }

  Future<void> closeAll() async {
    await Hive.close();
  }

  ValueListenable<Box<T>> listenable<T>({String? boxName, List<dynamic>? keys}) {
    final box = getBox<T>(boxName ?? defaultBoxName);
    return box.listenable(keys: keys);
  }
}
`;
        fs.writeFileSync(hiveServicePath, hiveServiceTemplate);
    }
}

export function generateThemeFiles(rootPath: string) {
    const themeDir = path.join(rootPath, 'lib', 'core', 'theme');
    fs.mkdirSync(themeDir, { recursive: true });

    // 1. App Colors
    const colorsPath = path.join(themeDir, 'app_colors.dart');
    if (!fs.existsSync(colorsPath)) {
        const colorsTemplate = `import 'package:flutter/material.dart';

class AppColors {
  // Light Theme Colors
  static const Color primary = Color(0xFF6366F1); // Indigo
  static const Color primaryLight = Color(0xFFEEF2FF);
  static const Color secondary = Color(0xFF10B981); // Emerald
  static const Color background = Color(0xFFF9FAFB);
  static const Color surface = Colors.white;
  static const Color textPrimary = Color(0xFF1F2937);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color error = Color(0xFFEF4444);

  // Dark Theme Colors
  static const Color primaryDark = Color(0xFF818CF8);
  static const Color backgroundDark = Color(0xFF111827);
  static const Color surfaceDark = Color(0xFF1F2937);
  static const Color textPrimaryDark = Color(0xFFF9FAFB);
  static const Color textSecondaryDark = Color(0xFF9CA3AF);
}
`;
        fs.writeFileSync(colorsPath, colorsTemplate);
    }

    // 2. App Text Styles
    const textStylePath = path.join(themeDir, 'app_text_style.dart');
    if (!fs.existsSync(textStylePath)) {
        const textStyleTemplate = `import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'app_colors.dart';

class AppTextStyle {
  static TextStyle get heading1 => TextStyle(
        fontSize: 24.sp,
        fontWeight: FontWeight.bold,
        color: AppColors.textPrimary,
      );

  static TextStyle get heading2 => TextStyle(
        fontSize: 20.sp,
        fontWeight: FontWeight.bold,
        color: AppColors.textPrimary,
      );

  static TextStyle get bodyLarge => TextStyle(
        fontSize: 16.sp,
        fontWeight: FontWeight.normal,
        color: AppColors.textPrimary,
      );

  static TextStyle get bodyMedium => TextStyle(
        fontSize: 14.sp,
        fontWeight: FontWeight.normal,
        color: AppColors.textPrimary,
      );

  static TextStyle get bodySmall => TextStyle(
        fontSize: 12.sp,
        fontWeight: FontWeight.normal,
        color: AppColors.textSecondary,
      );

  // Dark styles
  static TextStyle get heading1Dark => heading1.copyWith(color: AppColors.textPrimaryDark);
  static TextStyle get heading2Dark => heading2.copyWith(color: AppColors.textPrimaryDark);
  static TextStyle get bodyLargeDark => bodyLarge.copyWith(color: AppColors.textPrimaryDark);
  static TextStyle get bodyMediumDark => bodyMedium.copyWith(color: AppColors.textPrimaryDark);
  static TextStyle get bodySmallDark => bodySmall.copyWith(color: AppColors.textSecondaryDark);
}
`;
        fs.writeFileSync(textStylePath, textStyleTemplate);
    }

    // 3. App Theme
    const themePath = path.join(themeDir, 'app_theme.dart');
    if (!fs.existsSync(themePath)) {
        const themeTemplate = `import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'app_colors.dart';
import 'app_text_style.dart';

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.background,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        titleTextStyle: AppTextStyle.heading2,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.r),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: Size(double.infinity, 48.h),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.r),
          ),
          textStyle: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 16.h),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        labelStyle: AppTextStyle.bodyMedium.copyWith(color: AppColors.textSecondary),
        hintStyle: AppTextStyle.bodyMedium.copyWith(color: AppColors.textSecondary),
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: AppColors.primaryDark,
      scaffoldBackgroundColor: AppColors.backgroundDark,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surfaceDark,
        foregroundColor: AppColors.textPrimaryDark,
        elevation: 0,
        titleTextStyle: AppTextStyle.heading2Dark,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surfaceDark,
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.r),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryDark,
          foregroundColor: Colors.black,
          minimumSize: Size(double.infinity, 48.h),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.r),
          ),
          textStyle: TextStyle(
            fontSize: 16.sp,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceDark,
        contentPadding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 16.h),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: Color(0xFF374151)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: Color(0xFF374151)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.r),
          borderSide: const BorderSide(color: AppColors.primaryDark, width: 2),
        ),
        labelStyle: AppTextStyle.bodyMediumDark.copyWith(color: AppColors.textSecondaryDark),
        hintStyle: AppTextStyle.bodyMediumDark.copyWith(color: AppColors.textSecondaryDark),
      ),
    );
  }
}
`;
        fs.writeFileSync(themePath, themeTemplate);
    }
}

function updateMainDartForTheme(rootPath: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add import
    const importTheme = "import 'core/theme/app_theme.dart';";
    if (!content.includes('app_theme.dart')) {
        content = `${importTheme}\n` + content;
    }

    // Add theme and darkTheme inside MaterialApp.router or MaterialApp
    const themeSnippet = `          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeMode.system,`;

    if (!content.includes('theme: AppTheme.lightTheme')) {
        if (content.includes('MaterialApp.router(')) {
            content = content.replace('MaterialApp.router(', `MaterialApp.router(\n${themeSnippet}`);
        } else if (content.includes('MaterialApp(')) {
            content = content.replace('MaterialApp(', `MaterialApp(\n${themeSnippet}`);
        }
    }

    fs.writeFileSync(mainPath, content);
}

export function updateMainDartForHive(rootPath: string, boxNames: string[] = []) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    let content = fs.readFileSync(mainPath, 'utf8');

    // Add imports
    const hiveImports = "import 'package:hive_flutter/hive_flutter.dart';\nimport 'core/services/hive_service.dart';";
    if (!content.includes('hive_flutter.dart')) {
        content = `${hiveImports}\n` + content;
    }

    if (!content.includes('Hive.initFlutter()') && !content.includes('HiveService().init()')) {
        const initSnippet = `  await Hive.initFlutter();\n  await HiveService().init();`;

        // Make sure main is async
        if (content.includes('void main() {')) {
            content = content.replace('void main() {', 'void main() async {');
        }

        if (content.includes('WidgetsFlutterBinding.ensureInitialized();')) {
            content = content.replace(
                'WidgetsFlutterBinding.ensureInitialized();',
                `WidgetsFlutterBinding.ensureInitialized();\n${initSnippet}`
            );
        } else if (content.includes('void main() async {')) {
            content = content.replace(
                'void main() async {',
                `void main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n${initSnippet}`
            );
        }
    }

    // Pre-open boxes if specified
    if (boxNames && boxNames.length > 0) {
        for (const boxName of boxNames) {
            if (!content.includes(`'${boxName}'`) && !content.includes(`"${boxName}"`)) {
                const boxSnippet = `  await HiveService().openBox('${boxName}');`;
                if (content.includes('await HiveService().init();')) {
                    content = content.replace(
                        'await HiveService().init();',
                        `await HiveService().init();\n${boxSnippet}`
                    );
                } else if (content.includes('await Hive.initFlutter();')) {
                    content = content.replace(
                        'await Hive.initFlutter();',
                        `await Hive.initFlutter();\n${boxSnippet}`
                    );
                }
            }
        }
    }

    fs.writeFileSync(mainPath, content);
}

export function ensureHiveServiceInDi(rootPath: string) {
    const diPath = path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
    if (!fs.existsSync(diPath)) return;

    const packageName = getPackageName(rootPath);
    let content = fs.readFileSync(diPath, 'utf8');

    if (!content.includes('registerLazySingleton<HiveService>') && !content.includes('registerSingleton<HiveService>')) {
        const importHiveService = `import 'package:${packageName}/core/services/hive_service.dart';\n`;
        if (!content.includes('core/services/hive_service.dart')) {
            content = importHiveService + content;
        }

        const regSnippet = `  if (!getIt.isRegistered<HiveService>()) {\n    getIt.registerLazySingleton<HiveService>(() => HiveService());\n  }\n`;
        if (content.includes('void configureDependencies() {')) {
            content = content.replace('void configureDependencies() {', `void configureDependencies() {\n${regSnippet}`);
        } else {
            const tag = '// Features register tag (DO NOT REMOVE)';
            if (content.includes(tag)) {
                content = content.replace(tag, `${regSnippet}  ${tag}`);
            } else if (content.includes('getIt.register')) {
                content = content.replace(/(getIt\.register[^\n]+)/, `${regSnippet}  $1`);
            }
        }

        fs.writeFileSync(diPath, content);
    }
}

export function ensureBuildYamlForExplicitToJson(rootPath: string) {
    if (!fs.existsSync(rootPath)) {
        fs.mkdirSync(rootPath, { recursive: true });
    }
    const buildYamlPath = path.join(rootPath, 'build.yaml');
    if (!fs.existsSync(buildYamlPath)) {
        fs.writeFileSync(
            buildYamlPath,
`targets:
  $default:
    builders:
      json_serializable:
        options:
          explicit_to_json: true
`
        );
    } else {
        let content = fs.readFileSync(buildYamlPath, 'utf8');
        if (!content.includes('explicit_to_json')) {
            if (content.includes('json_serializable:')) {
                content = content.replace('json_serializable:', 'json_serializable:\n        options:\n          explicit_to_json: true');
            } else {
                content += `\ntargets:\n  $default:\n    builders:\n      json_serializable:\n        options:\n          explicit_to_json: true\n`;
            }
            fs.writeFileSync(buildYamlPath, content);
        }
    }
}

export async function ensureHiveEnvironment(rootPath: string, boxNames: string[] = []): Promise<boolean> {
    ensureBuildYamlForExplicitToJson(rootPath);
    const pubspecModified = configurePubspecForHive(rootPath);
    if (pubspecModified) {
        await runPubAdd('hive hive_flutter', rootPath);
    }

    generateHiveFiles(rootPath);
    updateMainDartForHive(rootPath, boxNames);
    ensureHiveServiceInDi(rootPath);

    return true;
}

function updateDioForSslPinning(rootPath: string) {
    const dioPath = path.join(rootPath, 'lib', 'core', 'network', 'dio_configuration.dart');
    if (!fs.existsSync(dioPath)) return;

    let content = fs.readFileSync(dioPath, 'utf8');

    // Add imports
    const importIo = "import 'dart:io';\nimport 'package:crypto/crypto.dart';\nimport 'package:dio/io.dart';";
    if (!content.includes('package:dio/io.dart')) {
        content = `${importIo}\n` + content;
    }

    // Add HttpClientAdapter configuration
    const pinningSnippet = `    // SSL Pinning Configuration (Optional per host)
    // Set [pinnedFingerprints] below to enforce pinning for specific hosts.
    // Until a host is added here, all valid system-trusted certificates are accepted as normal.
    dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.badCertificateCallback = (X509Certificate cert, String host, int port) {
          // Map of host -> expected SHA-256 fingerprint (hex, lowercase, no separators).
          // Example: {'api.yourdomain.com': 'a1b2c3...'}
          const pinnedFingerprints = <String, String>{};

          final pinnedFingerprint = pinnedFingerprints[host];
          if (pinnedFingerprint == null) {
            // No pin configured for this host: fall back to the platform's
            // normal certificate validation result (this callback only fires
            // for certs that already failed that validation).
            return false;
          }

          final actualFingerprint = sha256.convert(cert.der).toString();
          return actualFingerprint.toLowerCase() == pinnedFingerprint.toLowerCase();
        };
        return client;
      },
    );`;

    if (!content.includes('httpClientAdapter')) {
        const target = 'final dio = Dio(';
        const index = content.indexOf(target);
        if (index !== -1) {
            const matchClosingParenthesis = content.indexOf(');', index);
            if (matchClosingParenthesis !== -1) {
                const insertPos = matchClosingParenthesis + 2;
                content = content.substring(0, insertPos) + '\n\n' + pinningSnippet + content.substring(insertPos);
            }
        }
    }

    fs.writeFileSync(dioPath, content);
}

function updateDioForConnectivity(rootPath: string) {
    const dioPath = path.join(rootPath, 'lib', 'core', 'network', 'dio_configuration.dart');
    if (!fs.existsSync(dioPath)) return;

    let content = fs.readFileSync(dioPath, 'utf8');

    // Add import
    const importInterceptor = "import 'connectivity_interceptor.dart';";
    if (!content.includes('connectivity_interceptor.dart')) {
        content = `${importInterceptor}\n` + content;
    }

    // Add interceptor to dio.interceptors
    const interceptorAdd = "dio.interceptors.add(ConnectivityInterceptor());";
    if (!content.includes('ConnectivityInterceptor()')) {
        const target = 'dio.interceptors.add(';
        const index = content.indexOf(target);
        if (index !== -1) {
            content = content.substring(0, index) + `${interceptorAdd}\n    ` + content.substring(index);
        }
    }

    fs.writeFileSync(dioPath, content);
}

export function configureAndroidSigning(rootPath: string, keystorePass: string): boolean {
    const ktsPath = path.join(rootPath, 'android', 'app', 'build.gradle.kts');
    const groovyPath = path.join(rootPath, 'android', 'app', 'build.gradle');

    // Create key.properties
    const keyPropsPath = path.join(rootPath, 'android', 'key.properties');
    const keyPropsContent = `storePassword=${keystorePass}
keyPassword=${keystorePass}
keyAlias=upload
storeFile=upload-keystore.jks
`;
    fs.writeFileSync(keyPropsPath, keyPropsContent);

    if (fs.existsSync(ktsPath)) {
        let content = fs.readFileSync(ktsPath, 'utf8');

        const propertiesLoader = `import java.util.Properties
import java.io.FileInputStream

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

`;
        if (!content.includes('keystoreProperties')) {
            content = propertiesLoader + content;
        }

        const signingConfigsBlock = `
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = keystoreProperties["storeFile"]?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }
`;
        if (!content.includes('create("release")')) {
            const androidIndex = content.indexOf('android {');
            if (androidIndex !== -1) {
                const nextBrace = content.indexOf('\n', androidIndex);
                content = content.substring(0, nextBrace + 1) + signingConfigsBlock + content.substring(nextBrace + 1);
            }
        }

        if (content.includes('signingConfig = signingConfigs.getByName("debug")')) {
            content = content.replace(
                'signingConfig = signingConfigs.getByName("debug")',
                'signingConfig = signingConfigs.getByName("release")'
            );
        } else if (!content.includes('signingConfigs.getByName("release")')) {
            const releaseBlockIndex = content.indexOf('release {');
            if (releaseBlockIndex !== -1) {
                const nextLineIndex = content.indexOf('\n', releaseBlockIndex);
                content = content.substring(0, nextLineIndex + 1) + '            signingConfig = signingConfigs.getByName("release")\n' + content.substring(nextLineIndex + 1);
            }
        }

        fs.writeFileSync(ktsPath, content);
        return true;
    } else if (fs.existsSync(groovyPath)) {
        let content = fs.readFileSync(groovyPath, 'utf8');

        const propertiesLoader = `def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

`;
        if (!content.includes('keystoreProperties')) {
            content = propertiesLoader + content;
        }

        const signingConfigsBlock = `
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }
`;
        if (!content.includes('release {') || !content.includes('keyAlias')) {
            const androidIndex = content.indexOf('android {');
            if (androidIndex !== -1) {
                const nextBrace = content.indexOf('\n', androidIndex);
                content = content.substring(0, nextBrace + 1) + signingConfigsBlock + content.substring(nextBrace + 1);
            }
        }

        content = content.replace(
            'signingConfig signingConfigs.debug',
            'signingConfig signingConfigs.release'
        );

        fs.writeFileSync(groovyPath, content);
        return true;
    } else {
        vscode.window.showErrorMessage('Android Gradle build file not found.');
        return false;
    }
}

async function runBuildRunner(rootPath: string): Promise<void> {
    return new Promise((resolve) => {
        exec('dart run build_runner build --delete-conflicting-outputs', { cwd: rootPath, env: getExtendedEnv() }, (err, stdout, stderr) => {
            if (err) {
                // Try fallback to flutter pub run
                exec('flutter pub run build_runner build --delete-conflicting-outputs', { cwd: rootPath, env: getExtendedEnv() }, (err2, stdout2, stderr2) => {
                    if (err2) {
                        console.error(`Build runner error: ${stderr2 || err2.message}`);
                        vscode.window.showWarningMessage(
                            `Build runner did not complete automatically. Run 'dart run build_runner build --delete-conflicting-outputs' in terminal.`
                        );
                    } else {
                        console.log(`Build runner finished successfully: ${stdout2}`);
                    }
                    resolve();
                });
            } else {
                console.log(`Build runner finished successfully: ${stdout}`);
                resolve();
            }
        });
    });
}

export function configurePubspecForTesting(rootPath: string, stateManagement: string) {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return;

    let content = fs.readFileSync(pubspecPath, 'utf8');
    const devDepTag = 'dev_dependencies:';

    if (content.includes(devDepTag)) {
        let testDeps = '';
        if (!content.includes('integration_test:')) {
            testDeps += `\n  integration_test:\n    sdk: flutter`;
        }
        if (!content.includes('mocktail:')) {
            testDeps += `\n  mocktail: ^1.0.4`;
        }
        if (stateManagement === 'BLoC' && !content.includes('bloc_test:')) {
            testDeps += `\n  bloc_test: ^9.1.7`;
        }

        if (testDeps) {
            content = content.replace(devDepTag, devDepTag + testDeps);
        }
    }

    fs.writeFileSync(pubspecPath, content);
}

export function generateTestBoilerplate(rootPath: string, stateManagement: string) {
    const pkgName = getPackageName(rootPath);
    
    // Create folders
    const unitDir = path.join(rootPath, 'test', 'unit');
    const widgetDir = path.join(rootPath, 'test', 'widget');
    const integrationDir = path.join(rootPath, 'integration_test');

    fs.mkdirSync(unitDir, { recursive: true });
    fs.mkdirSync(widgetDir, { recursive: true });
    fs.mkdirSync(integrationDir, { recursive: true });

    // 1. Sample Unit Test
    const unitTestPath = path.join(unitDir, 'sample_unit_test.dart');
    if (!fs.existsSync(unitTestPath)) {
        const unitTestContent = `import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockHttpClient extends Mock {}

void main() {
  group('Sample Unit Tests', () {
    test('standard math assertion', () {
      int result = 2 + 2;
      expect(result, equals(4));
    });

    test('mock class interaction', () {
      final client = MockHttpClient();
      when(() => client.toString()).thenReturn('MockedHttpClient');
      expect(client.toString(), equals('MockedHttpClient'));
    });
  });
}
`;
        fs.writeFileSync(unitTestPath, unitTestContent);
    }

    // 2. Bloc Test Example (if BLoC is used)
    if (stateManagement === 'BLoC') {
        const blocTestPath = path.join(unitDir, 'bloc_test_example.dart');
        if (!fs.existsSync(blocTestPath)) {
            const blocTestContent = `import 'package:flutter_test/flutter_test.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:mocktail/mocktail.dart';

void main() {
  group('Sample Bloc Tests', () {
    // Example of blocTest:
    // blocTest<MyBloc, MyState>(
    //   'emits [MyState] when MyEvent is added',
    //   build: () => MyBloc(),
    //   act: (bloc) => bloc.add(MyEvent()),
    //   expect: () => [isA<MyState>()],
    // );
  });
}
`;
            fs.writeFileSync(blocTestPath, blocTestContent);
        }
    }

    // 3. Sample Widget Test
    const widgetTestPath = path.join(widgetDir, 'sample_widget_test.dart');
    if (!fs.existsSync(widgetTestPath)) {
        const widgetTestContent = `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Sample Widget Tests', () {
    testWidgets('Counter increments smoke test example', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(child: Text('Hello World')),
          ),
        ),
      );

      expect(find.text('Hello World'), findsOneWidget);
      expect(find.text('Goodbye World'), findsNothing);
    });
  });
}
`;
        fs.writeFileSync(widgetTestPath, widgetTestContent);
    }

    // 4. Sample Integration Test
    const integrationTestPath = path.join(integrationDir, 'app_test.dart');
    if (!fs.existsSync(integrationTestPath)) {
        const integrationTestContent = `import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:${pkgName}/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('End-to-End Integration Test', () {
    testWidgets('verify app startup and homepage display', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();
    });
  });
}
`;
        fs.writeFileSync(integrationTestPath, integrationTestContent);
    }
}

export function generateGitHubActionsWorkflow(rootPath: string, buildTarget: string) {
    const workflowDir = path.join(rootPath, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });

    let buildSteps = '';
    if (buildTarget === 'APK' || buildTarget === 'Both') {
        buildSteps += `
      - name: Build APK
        run: flutter build apk --release`;
    }
    if (buildTarget === 'App Bundle (AAB)' || buildTarget === 'Both') {
        buildSteps += `
      - name: Build App Bundle
        run: flutter build appbundle --release`;
    }

    const workflowTemplate = `name: Flutter CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Flutter
        uses: subosito/flutter-action@v2
        with:
          channel: 'stable'
          cache: true

      - name: Install dependencies
        run: flutter pub get

      - name: Verify formatting
        run: dart format --output=none --set-exit-if-changed .
        continue-on-error: true

      - name: Analyze project source
        run: flutter analyze

      - name: Run tests
        run: flutter test
${buildSteps}

      - name: Upload build artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: build-outputs
          path: build/app/outputs/**/*
          if-no-files-found: ignore
`;

    const workflowPath = path.join(workflowDir, 'flutter.yml');
    fs.writeFileSync(workflowPath, workflowTemplate);
}

export function generateFlavorFiles(rootPath: string) {
    const flavors = ['dev', 'staging', 'prod'];
    const packageName = getPackageName(rootPath);
    const coreDir = path.join(rootPath, 'lib', 'core', 'config');
    fs.mkdirSync(coreDir, { recursive: true });

    // 1. FlavorConfig
    const flavorConfigPath = path.join(coreDir, 'flavor_config.dart');
    if (!fs.existsSync(flavorConfigPath)) {
        const flavorConfigTemplate = `enum Flavor { dev, staging, prod }

class FlavorConfig {
  final Flavor flavor;
  final String name;
  final String apiBaseUrl;

  static FlavorConfig? _instance;

  factory FlavorConfig({
    required Flavor flavor,
    required String name,
    required String apiBaseUrl,
  }) {
    _instance ??= FlavorConfig._internal(flavor, name, apiBaseUrl);
    return _instance!;
  }

  FlavorConfig._internal(this.flavor, this.name, this.apiBaseUrl);

  static FlavorConfig get instance {
    if (_instance == null) {
      throw Exception('FlavorConfig has not been initialized. Run one of the main_*.dart entrypoints.');
    }
    return _instance!;
  }

  static bool isProduction() => _instance?.flavor == Flavor.prod;
}
`;
        fs.writeFileSync(flavorConfigPath, flavorConfigTemplate);
    }

    // 2. Per-flavor entrypoints
    const flavorMeta: Record<string, { apiBaseUrl: string; appName: string }> = {
        dev: { apiBaseUrl: 'https://dev-api.yourdomain.com/v1/', appName: 'Flutter Config App (Dev)' },
        staging: { apiBaseUrl: 'https://staging-api.yourdomain.com/v1/', appName: 'Flutter Config App (Staging)' },
        prod: { apiBaseUrl: 'https://api.yourdomain.com/v1/', appName: 'Flutter Config App' },
    };

    for (const flavor of flavors) {
        const meta = flavorMeta[flavor];
        const entrypointPath = path.join(rootPath, 'lib', `main_${flavor}.dart`);
        if (!fs.existsSync(entrypointPath)) {
            const entrypointTemplate = `import 'package:flutter/material.dart';
import 'core/config/flavor_config.dart';
import 'main.dart' as runner;

void main() {
  FlavorConfig(
    flavor: Flavor.${flavor},
    name: '${flavor.toUpperCase()}',
    apiBaseUrl: '${meta.apiBaseUrl}',
  );
  runner.main();
}
`;
            fs.writeFileSync(entrypointPath, entrypointTemplate);
        }

        // Per-flavor env file (only if flutter_dotenv env flow was already initialized)
        const envPath = path.join(rootPath, `.env.${flavor}`);
        if (!fs.existsSync(envPath)) {
            fs.writeFileSync(envPath, `API_BASE_URL=${meta.apiBaseUrl}\nAPP_NAME=${meta.appName}\n`);
        }
    }

    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        let content = fs.readFileSync(gitignorePath, 'utf8');
        if (!content.includes('.env.dev')) {
            content += '\n# Flavor Environments\n.env.dev\n.env.staging\n.env.prod\n';
            fs.writeFileSync(gitignorePath, content);
        }
    }
}

export function configureAndroidFlavors(rootPath: string) {
    const ktsPath = path.join(rootPath, 'android', 'app', 'build.gradle.kts');
    const groovyPath = path.join(rootPath, 'android', 'app', 'build.gradle');

    if (fs.existsSync(ktsPath)) {
        let content = fs.readFileSync(ktsPath, 'utf8');
        if (content.includes('productFlavors')) return;

        const flavorsBlock = `
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "Flutter Config App (Dev)")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "Flutter Config App (Staging)")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "Flutter Config App")
        }
    }
`;
        const androidIndex = content.indexOf('android {');
        if (androidIndex !== -1) {
            const nextBrace = content.indexOf('\n', androidIndex);
            content = content.substring(0, nextBrace + 1) + flavorsBlock + content.substring(nextBrace + 1);
            fs.writeFileSync(ktsPath, content);
        }
    } else if (fs.existsSync(groovyPath)) {
        let content = fs.readFileSync(groovyPath, 'utf8');
        if (content.includes('productFlavors')) return;

        const flavorsBlock = `
    flavorDimensions "env"
    productFlavors {
        dev {
            dimension "env"
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
            resValue "string", "app_name", "Flutter Config App (Dev)"
        }
        staging {
            dimension "env"
            applicationIdSuffix ".staging"
            versionNameSuffix "-staging"
            resValue "string", "app_name", "Flutter Config App (Staging)"
        }
        prod {
            dimension "env"
            resValue "string", "app_name", "Flutter Config App"
        }
    }
`;
        const androidIndex = content.indexOf('android {');
        if (androidIndex !== -1) {
            const nextBrace = content.indexOf('\n', androidIndex);
            content = content.substring(0, nextBrace + 1) + flavorsBlock + content.substring(nextBrace + 1);
            fs.writeFileSync(groovyPath, content);
        }
    }
}

export function configureIosFlavors(rootPath: string) {
    const flavorsDir = path.join(rootPath, 'ios', 'Flutter', 'Flavors');
    fs.mkdirSync(flavorsDir, { recursive: true });

    const flavorApiUrls: Record<string, string> = {
        Dev: 'https://dev-api.yourdomain.com/v1/',
        Staging: 'https://staging-api.yourdomain.com/v1/',
        Prod: 'https://api.yourdomain.com/v1/',
    };

    for (const [flavor, apiUrl] of Object.entries(flavorApiUrls)) {
        const xcconfigPath = path.join(flavorsDir, `${flavor}.xcconfig`);
        if (!fs.existsSync(xcconfigPath)) {
            fs.writeFileSync(
                xcconfigPath,
                `// ${flavor} flavor overrides\n#include "Generated.xcconfig"\nAPI_BASE_URL = ${apiUrl}\nBUNDLE_SUFFIX = ${flavor === 'Prod' ? '' : `.${flavor.toLowerCase()}`}\n`
            );
        }
    }

    const readmePath = path.join(flavorsDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(
            readmePath,
            `# iOS Flavors\n\nXcode project files (.pbxproj) are not safe to edit programmatically, so wire these up manually once:\n\n1. Open \`ios/Runner.xcworkspace\` in Xcode.\n2. Duplicate the Debug/Release/Profile configurations for each flavor (Dev, Staging, Prod), basing each on the matching xcconfig file in this folder.\n3. Create matching Schemes (Runner-dev, Runner-staging, Runner-prod) pointing at the corresponding build configurations.\n4. Run with \`flutter run --flavor dev -t lib/main_dev.dart\` (swap dev for staging/prod).\n`
        );
    }
}

function findFileRecursive(dir: string, matcher: (fileName: string) => boolean): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findFileRecursive(fullPath, matcher);
            if (found) return found;
        } else if (matcher(entry.name)) {
            return fullPath;
        }
    }
    return null;
}

export function generateMethodChannelDartFile(
    rootPath: string,
    channelSnake: string,
    channelPascal: string,
    methodCamel: string,
    channelId: string
) {
    const platformDir = path.join(rootPath, 'lib', 'core', 'platform');
    fs.mkdirSync(platformDir, { recursive: true });

    const dartPath = path.join(platformDir, `${channelSnake}_channel.dart`);
    if (fs.existsSync(dartPath)) return;

    const dartTemplate = `import 'package:flutter/services.dart';

class ${channelPascal}Channel {
  ${channelPascal}Channel._();

  static const MethodChannel _channel = MethodChannel('${channelId}');

  static Future<dynamic> ${methodCamel}() async {
    try {
      return await _channel.invokeMethod('${methodCamel}');
    } on PlatformException catch (e) {
      throw Exception('Failed to call ${methodCamel}: \${e.message}');
    }
  }
}
`;
    fs.writeFileSync(dartPath, dartTemplate);
}

export function configureAndroidMethodChannel(
    rootPath: string,
    channelPascal: string,
    methodCamel: string,
    channelId: string
): boolean {
    const kotlinDir = path.join(rootPath, 'android', 'app', 'src', 'main', 'kotlin');

    const mainActivityPath = findFileRecursive(kotlinDir, (f) => f === 'MainActivity.kt');
    if (mainActivityPath) {
        let content = fs.readFileSync(mainActivityPath, 'utf8');
        if (content.includes(`"${channelId}"`)) return true;

        const kotlinImports: string[] = [];
        if (!content.includes('import io.flutter.embedding.engine.FlutterEngine')) {
            kotlinImports.push('import io.flutter.embedding.engine.FlutterEngine');
        }
        if (!content.includes('import io.flutter.plugin.common.MethodChannel')) {
            kotlinImports.push('import io.flutter.plugin.common.MethodChannel');
        }
        if (kotlinImports.length) {
            content = content.replace(/^(package [^\n]+\n)/, `$1\n${kotlinImports.join('\n')}\n`);
        }

        const handlerBlock = `\n    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "${channelId}").setMethodCallHandler { call, result ->
            when (call.method) {
                "${methodCamel}" -> {
                    // TODO: Implement ${methodCamel} native logic here
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }\n`;

        if (content.includes('override fun configureFlutterEngine')) {
            const idx = content.indexOf('override fun configureFlutterEngine');
            const braceIdx = content.indexOf('{', idx);
            const methodChannelSnippet = `\n        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "${channelId}").setMethodCallHandler { call, result ->
            when (call.method) {
                "${methodCamel}" -> {
                    // TODO: Implement ${methodCamel} native logic here
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }\n`;
            content = content.slice(0, braceIdx + 1) + methodChannelSnippet + content.slice(braceIdx + 1);
        } else {
            const classMatch = content.match(/class MainActivity[^{]*\{/);
            if (classMatch && classMatch.index !== undefined) {
                const insertAt = classMatch.index + classMatch[0].length;
                content = content.slice(0, insertAt) + handlerBlock + content.slice(insertAt);
            }
        }

        fs.writeFileSync(mainActivityPath, content);
        return true;
    }

    const javaDir = path.join(rootPath, 'android', 'app', 'src', 'main', 'java');
    const javaMainActivityPath = findFileRecursive(javaDir, (f) => f === 'MainActivity.java');
    if (!javaMainActivityPath) return false;

    let content = fs.readFileSync(javaMainActivityPath, 'utf8');
    if (content.includes(`"${channelId}"`)) return true;

    const javaImports: string[] = [];
    if (!content.includes('import io.flutter.embedding.engine.FlutterEngine;')) {
        javaImports.push('import io.flutter.embedding.engine.FlutterEngine;');
    }
    if (!content.includes('import io.flutter.plugin.common.MethodChannel;')) {
        javaImports.push('import io.flutter.plugin.common.MethodChannel;');
    }
    if (!content.includes('import androidx.annotation.NonNull;')) {
        javaImports.push('import androidx.annotation.NonNull;');
    }
    if (javaImports.length) {
        content = content.replace(/^(package [^\n]+;\n)/, `$1\n${javaImports.join('\n')}\n`);
    }

    const javaSnippet = `\n        new MethodChannel(flutterEngine.getDartExecutor().getBinaryMessenger(), "${channelId}").setMethodCallHandler((call, result) -> {
            if ("${methodCamel}".equals(call.method)) {
                // TODO: Implement ${methodCamel} native logic here
                result.success(null);
            } else {
                result.notImplemented();
            }
        });\n`;

    if (content.includes('configureFlutterEngine')) {
        const idx = content.indexOf('configureFlutterEngine');
        const braceIdx = content.indexOf('{', idx);
        if (braceIdx !== -1) {
            content = content.slice(0, braceIdx + 1) + javaSnippet + content.slice(braceIdx + 1);
        }
    } else {
        const handlerBlock = `\n    @Override
    public void configureFlutterEngine(@NonNull FlutterEngine flutterEngine) {
        super.configureFlutterEngine(flutterEngine);${javaSnippet}    }\n`;
        const classMatch = content.match(/class MainActivity[^{]*\{/);
        if (classMatch && classMatch.index !== undefined) {
            const insertAt = classMatch.index + classMatch[0].length;
            content = content.slice(0, insertAt) + handlerBlock + content.slice(insertAt);
        }
    }

    fs.writeFileSync(javaMainActivityPath, content);
    return true;
}

export function configureIosMethodChannel(
    rootPath: string,
    methodCamel: string,
    channelId: string
): boolean {
    const appDelegatePath = path.join(rootPath, 'ios', 'Runner', 'AppDelegate.swift');
    if (!fs.existsSync(appDelegatePath)) return false;

    let content = fs.readFileSync(appDelegatePath, 'utf8');
    if (content.includes(`"${channelId}"`)) return true;

    const handlerBlock = `    let controller = window?.rootViewController as! FlutterViewController
    let ${methodCamel}Channel = FlutterMethodChannel(name: "${channelId}", binaryMessenger: controller.binaryMessenger)
    ${methodCamel}Channel.setMethodCallHandler { (call, result) in
      switch call.method {
      case "${methodCamel}":
        // TODO: Implement ${methodCamel} native logic here
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
`;

    const didFinishMatch = content.match(/didFinishLaunchingWithOptions[^{]*\{/);
    if (didFinishMatch && didFinishMatch.index !== undefined) {
        const insertAt = didFinishMatch.index + didFinishMatch[0].length;
        content = content.slice(0, insertAt) + '\n' + handlerBlock + content.slice(insertAt);
        fs.writeFileSync(appDelegatePath, content);
        return true;
    }

    return false;
}

export function generatePaginatedListFiles(
    targetDir: string,
    name: string,
    pascal: string,
    itemModel: FeatureModel,
    endpoint: string,
    packageName: string
) {
    const featDir = path.join(targetDir, name);
    const modelsDir = path.join(featDir, 'models');
    const controllerDir = path.join(featDir, 'pagination');
    const pagesDir = path.join(featDir, 'pages');

    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(controllerDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });

    const itemPascal = itemModel.modelNamePascal;
    const itemSnake = itemModel.modelNameSnake;

    // 1. Item model (plain, no freezed dependency required)
    const modelPath = path.join(modelsDir, `${itemSnake}_model.dart`);
    if (!fs.existsSync(modelPath)) {
        const propertiesDecl = itemModel.properties.map(p => `  final ${p.type} ${toCamelCase(p.name)};`).join('\n');
        const constructorDecl = itemModel.properties.map(p => `    required this.${toCamelCase(p.name)},`).join('\n');
        const fromJsonDecl = itemModel.properties.map(p => {
            const camelName = toCamelCase(p.name);
            return `      ${camelName}: json['${p.name}'],`;
        }).join('\n');

        fs.writeFileSync(
            modelPath,
            `class ${itemPascal}Model {
${propertiesDecl}

  ${itemPascal}Model({
${constructorDecl}
  });

  factory ${itemPascal}Model.fromJson(Map<String, dynamic> json) {
    return ${itemPascal}Model(
${fromJsonDecl}
    );
  }
}
`
        );
    }

    // 2. Paginated controller (ChangeNotifier, works regardless of chosen architecture/state mgmt)
    const controllerPath = path.join(controllerDir, `${name}_pagination_controller.dart`);
    fs.writeFileSync(
        controllerPath,
        `import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../models/${itemSnake}_model.dart';

class ${pascal}PaginationController extends ChangeNotifier {
  final Dio dio;
  static const int pageSize = 20;

  ${pascal}PaginationController(this.dio);

  final List<${itemPascal}Model> items = [];
  int _page = 1;
  bool isLoading = false;
  bool isLoadingMore = false;
  bool hasMore = true;
  String? errorMessage;

  Future<void> loadInitial() async {
    _page = 1;
    hasMore = true;
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final results = await _fetchPage(_page);
      items
        ..clear()
        ..addAll(results);
      hasMore = results.length == pageSize;
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMore() async {
    if (isLoadingMore || !hasMore) return;
    isLoadingMore = true;
    notifyListeners();

    try {
      final nextPage = _page + 1;
      final results = await _fetchPage(nextPage);
      items.addAll(results);
      hasMore = results.length == pageSize;
      _page = nextPage;
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoadingMore = false;
      notifyListeners();
    }
  }

  Future<void> refresh() => loadInitial();

  Future<List<${itemPascal}Model>> _fetchPage(int page) async {
    final response = await dio.get(
      '${endpoint}',
      queryParameters: {'page': page, 'limit': pageSize},
    );
    final data = response.data;
    final List<dynamic> rawList = data is Map<String, dynamic> ? (data['data'] ?? data['items'] ?? []) : data as List<dynamic>;
    return rawList.map((json) => ${itemPascal}Model.fromJson(json as Map<String, dynamic>)).toList();
  }
}
`
    );

    // 3. Page with infinite scroll + pull-to-refresh
    const pagePath = path.join(pagesDir, `${name}_list_page.dart`);
    fs.writeFileSync(
        pagePath,
        `import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:provider/provider.dart';
import 'package:${packageName}/core/di/injection.dart';
import '../pagination/${name}_pagination_controller.dart';

class ${pascal}ListPage extends StatefulWidget {
  static const route = '/${name}';
  const ${pascal}ListPage({super.key});

  @override
  State<${pascal}ListPage> createState() => _${pascal}ListPageState();
}

class _${pascal}ListPageState extends State<${pascal}ListPage> {
  final ScrollController _scrollController = ScrollController();
  late final ${pascal}PaginationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = ${pascal}PaginationController(getIt<Dio>());
    _controller.loadInitial();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      _controller.loadMore();
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _controller,
      child: Scaffold(
        appBar: AppBar(title: const Text('${pascal}')),
        body: Consumer<${pascal}PaginationController>(
          builder: (context, controller, _) {
            if (controller.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            if (controller.errorMessage != null && controller.items.isEmpty) {
              return Center(child: Text(controller.errorMessage!));
            }
            return RefreshIndicator(
              onRefresh: controller.refresh,
              child: ListView.builder(
                controller: _scrollController,
                itemCount: controller.items.length + (controller.hasMore ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= controller.items.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final item = controller.items[index];
                  return ListTile(title: Text(item.toString()));
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
`
    );
}

export function getArchitectureLintRules(architecture: string): string {
    const indent = (lines: string[]) => lines.map((line) => `    ${line}`).join('\n');

    if (architecture.includes('Clean')) {
        return indent([
            '# Clean Architecture (Feature-First)',
            '# Expected structure: lib/features/<feature>/{data,domain,presentation}/',
            '# Keep domain layer free of Flutter imports; depend on abstractions, not implementations.',
            'prefer_relative_imports: true',
            'avoid_relative_lib_imports: true',
            'depend_on_referenced_packages: true',
            'implementation_imports: false',
            'directives_ordering: true',
        ]);
    }

    if (architecture.includes('MVVM')) {
        return indent([
            '# MVVM (Model-View-ViewModel)',
            '# Expected structure: lib/features/<feature>/{models,services,viewmodels,views}/',
            '# Keep business logic in ViewModels; Views should only bind UI to state.',
            'prefer_relative_imports: true',
            'sort_constructors_first: true',
            'use_setters_to_change_properties: false',
            'depend_on_referenced_packages: true',
        ]);
    }

    if (architecture.includes('MVC')) {
        return indent([
            '# MVC (Model-View-Controller)',
            '# Expected structure: lib/features/<feature>/{models,controllers,views}/',
            '# Controllers handle input and update Models; Views remain presentation-only.',
            'prefer_relative_imports: true',
            'sort_constructors_first: true',
            'depend_on_referenced_packages: true',
            'use_setters_to_change_properties: false',
        ]);
    }

    return indent([
        '# General architecture conventions',
        'prefer_relative_imports: true',
        'depend_on_referenced_packages: true',
    ]);
}

export function getStateManagementLintRules(stateManagement: string): string {
    const indent = (lines: string[]) => lines.map((line) => `    ${line}`).join('\n');

    switch (stateManagement) {
        case 'BLoC':
            return indent([
                '# BLoC state management',
                '# Keep events, states, and blocs in presentation/bloc/ (Clean) or viewmodels/ (MVVM).',
                '# Recommended: add bloc_lint via custom_lint for stricter BLoC-specific checks.',
                'avoid_print: true',
                'cancel_subscriptions: true',
                'close_sinks: true',
                'prefer_final_fields: true',
            ]);
        case 'Riverpod':
            return indent([
                '# Riverpod state management',
                '# Prefer @riverpod code generation; keep providers in presentation/riverpod/.',
                '# Recommended: add riverpod_lint via custom_lint for provider-specific checks.',
                'avoid_print: true',
                'prefer_final_fields: true',
                'prefer_const_constructors: true',
            ]);
        case 'Provider':
            return indent([
                '# Provider state management',
                '# Use ChangeNotifier or Provider subclasses; expose via MultiProvider at app root.',
                'avoid_print: true',
                'prefer_final_fields: true',
                'use_key_in_widget_constructors: true',
                'prefer_const_constructors: true',
            ]);
        case 'PureBind':
            return indent([
                '# PureBind state management',
                '# Keep controllers in presentation/controllers/ and bind UI reactively.',
                'avoid_print: true',
                'prefer_final_fields: true',
                'prefer_const_constructors: true',
            ]);
        case 'GetX':
            return indent([
                '# GetX state management',
                '# Keep GetxController classes in presentation/controllers/; avoid mixing routing and business logic.',
                'avoid_print: true',
                'prefer_const_constructors: true',
                'prefer_final_fields: true',
            ]);
        default:
            return indent([
                '# State management best practices',
                'avoid_print: true',
                'prefer_final_fields: true',
            ]);
    }
}

function dedupeLintRuleSection(section: string, seenRules: Set<string>): string {
    const output: string[] = [];

    for (const line of section.split('\n')) {
        const ruleMatch = line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/);
        if (!ruleMatch) {
            output.push(line);
            continue;
        }

        const ruleName = ruleMatch[1];
        if (seenRules.has(ruleName)) continue;

        seenRules.add(ruleName);
        output.push(line);
    }

    return output.join('\n');
}

const FLUTTER_CONFIG_LINT_START = '    # >>> Flutter Config lint rules';
const FLUTTER_CONFIG_LINT_END = '    # <<< Flutter Config lint rules';
const FLUTTER_CONFIG_LINT_START_PATTERN = /^\s*# >>> Flutter Config lint rules\s*$/;
const FLUTTER_CONFIG_LINT_END_PATTERN = /^\s*# <<< Flutter Config lint rules\s*$/;

function collectLintRuleNames(content: string): Set<string> {
    const withoutGeneratedBlock = removeFlutterConfigManagedBlocks(content);
    const rules = new Set<string>();

    for (const line of withoutGeneratedBlock.split('\n')) {
        const ruleMatch = line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/);
        if (ruleMatch) rules.add(ruleMatch[1]);
    }

    return rules;
}

function removeFlutterConfigManagedBlocks(content: string): string {
    const lines = content.split('\n');
    const output: string[] = [];
    let skippingManagedBlock = false;

    for (const line of lines) {
        if (FLUTTER_CONFIG_LINT_START_PATTERN.test(line)) {
            skippingManagedBlock = true;
            continue;
        }

        if (FLUTTER_CONFIG_LINT_END_PATTERN.test(line)) {
            skippingManagedBlock = false;
            continue;
        }

        if (skippingManagedBlock) continue;

        output.push(line);
    }

    return output.join('\n');
}

function removeLegacyFlutterConfigLintSections(content: string): string {
    const lines = content.split('\n');
    const output: string[] = [];
    let skippingLegacySection = false;

    for (const line of lines) {
        const isLegacySectionStart = /^\s*# --- (Shared Flutter best practices|Architecture: .+|State Management: .+) ---\s*$/.test(line);
        if (isLegacySectionStart) {
            skippingLegacySection = true;
            continue;
        }

        if (skippingLegacySection) {
            const isLegacyComment = /^\s*#/.test(line);
            const isLegacyRule = /^\s*[a-zA-Z][a-zA-Z0-9_]*:\s*(true|false)\s*$/.test(line);
            const isLegacyBareRule = /^\s*[a-zA-Z][a-zA-Z0-9_]*\s*$/.test(line);
            const isBlank = /^\s*$/.test(line);

            if (isLegacyComment || isLegacyRule || isLegacyBareRule || isBlank) {
                continue;
            }

            skippingLegacySection = false;
        }

        output.push(line);
    }

    return output.join('\n');
}

function buildFlutterConfigLintBlock(architecture: string, stateManagement: string, existingRules = new Set<string>()): string {
    const indent = (lines: string[]) => lines.map((line) => `    ${line}`).join('\n');
    const seenRules = new Set(Array.from(existingRules));
    const sharedRules = dedupeLintRuleSection(indent([
        'always_declare_return_types: true',
        'avoid_empty_else: true',
        'avoid_unnecessary_containers: true',
        'prefer_const_constructors: true',
        'prefer_const_declarations: true',
        'prefer_final_fields: true',
        'prefer_final_locals: true',
        'require_trailing_commas: true',
        'sort_child_properties_last: true',
        'use_key_in_widget_constructors: true',
    ]), seenRules);
    const archRules = dedupeLintRuleSection(getArchitectureLintRules(architecture), seenRules);
    const stateRules = dedupeLintRuleSection(getStateManagementLintRules(stateManagement), seenRules);

    return `${FLUTTER_CONFIG_LINT_START}
    # Architecture: ${architecture}
    # State Management: ${stateManagement}

    # Shared Flutter best practices
${sharedRules}

    # Architecture rules
${archRules}

    # State management rules
${stateRules}
${FLUTTER_CONFIG_LINT_END}`;
}

function removeIncompatibleCustomLintPlugin(content: string): string {
    let result = content.replace(/^\s*-\s*custom_lint\s*(\r?\n|$)/gm, '');
    result = result.replace(/^\s*plugins:\s*(\r?\n)+(?=\s*[a-zA-Z0-9_]+:|\S|$)/gm, '');
    return result;
}

export function generateAnalysisOptions(rootPath: string, architecture: string, stateManagement: string): void {
    const analysisPath = path.join(rootPath, 'analysis_options.yaml');

    if (!fs.existsSync(analysisPath)) {
        const content = `# Generated by Flutter Config

include: package:flutter_lints/flutter.yaml

analyzer:
  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
    - "**/*.config.dart"
    - "**/*.mocks.dart"
    - "build/**"
    - "lib/generated/**"

linter:
  rules:
${buildFlutterConfigLintBlock(architecture, stateManagement)}
`;

        fs.writeFileSync(analysisPath, content);
        return;
    }

    let content = fs.readFileSync(analysisPath, 'utf8');
    content = removeFlutterConfigManagedBlocks(content);
    content = removeLegacyFlutterConfigLintSections(content);
    content = removeIncompatibleCustomLintPlugin(content);

    const existingRules = collectLintRuleNames(content);
    const generatedBlock = buildFlutterConfigLintBlock(architecture, stateManagement, existingRules);

    if (!content.includes('include: package:flutter_lints/flutter.yaml')) {
        content = `include: package:flutter_lints/flutter.yaml\n\n${content}`;
    }

    if (!content.endsWith('\n')) {
        content += '\n';
    }

    if (content.match(/^linter:\s*$/m) && content.match(/^\s{2}rules:\s*$/m)) {
        content = content.replace(/^(\s{2}rules:\s*\r?\n)/m, `$1${generatedBlock}\n`);
    } else if (content.match(/^linter:\s*$/m)) {
        content = content.replace(/^(linter:\s*\r?\n)/m, `$1  rules:\n${generatedBlock}\n`);
    } else {
        content = `${content}\nlinter:\n  rules:\n${generatedBlock}\n`;
    }

    fs.writeFileSync(analysisPath, content);
}

export function configurePubspecForHive(rootPath: string): boolean {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return false;

    let content = fs.readFileSync(pubspecPath, 'utf8');
    let modified = false;

    const depTag = 'dependencies:';
    if (content.includes(depTag)) {
        let depsToAdd = '';
        if (!/^\s*hive\s*:/m.test(content)) {
            depsToAdd += '\n  hive: ^2.2.3';
        }
        if (!/^\s*hive_flutter\s*:/m.test(content)) {
            depsToAdd += '\n  hive_flutter: ^1.1.0';
        }
        if (depsToAdd) {
            content = content.replace(depTag, depTag + depsToAdd);
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(pubspecPath, content);
    }
    return modified;
}

export function configurePubspecForLints(rootPath: string, addFlutterLints = true): boolean {
    const pubspecPath = path.join(rootPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return false;

    let content = fs.readFileSync(pubspecPath, 'utf8');
    const cleanedContent = content
        .replace(/^\s*custom_lint\s*:\s*.*\n?/m, '')
        .replace(/^\s*clean_arch_lint\s*:\s*.*\n?/m, '')
        .replace(/^\s*clean_architecture_lints\s*:\s*.*\n?/m, '');
    const removedIncompatibleDependency = cleanedContent !== content;
    content = cleanedContent;

    const lintDependencies = [
        'flutter_lints: ^6.0.0',
    ];
    const missingDependencies = addFlutterLints ? lintDependencies.filter((dependency) => {
        const dependencyName = dependency.split(':')[0];
        return !new RegExp(`^\\s*${dependencyName}\\s*:`, 'm').test(content);
    }) : [];
    if (missingDependencies.length === 0) {
        if (removedIncompatibleDependency) {
            fs.writeFileSync(pubspecPath, content);
            return true;
        }
        return false;
    }

    const devDepTag = 'dev_dependencies:';
    if (!content.includes(devDepTag)) {
        const needsTrailingNewline = content.length > 0 && !content.endsWith('\n');
        content = `${content}${needsTrailingNewline ? '\n' : ''}\n${devDepTag}\n  ${missingDependencies.join('\n  ')}\n`;
        fs.writeFileSync(pubspecPath, content);
        return true;
    }

    content = content.replace(devDepTag, `${devDepTag}\n  ${missingDependencies.join('\n  ')}`);
    fs.writeFileSync(pubspecPath, content);
    return true;
}

export function deactivate() {}
