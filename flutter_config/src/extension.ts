import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

interface ModelProperty {
    name: string;
    type: string;
}

interface FeatureModel {
    modelName: string;
    modelNamePascal: string;
    modelNameSnake: string;
    modelNameCamel: string;
    properties: ModelProperty[];
}

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
            ['Clean Architecture (Feature-First)', 'MVVM (Model-View-ViewModel)'],
            { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
        );
        if (!archType) return;

        // Choose State Management
        const stateManagement = await vscode.window.showQuickPick(
            ['BLoC', 'Riverpod'],
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
            await installDependencies(rootPath, stateManagement);

            progress.report({ message: "Generating core configuration..." });
            generateCoreConfig(rootPath);
            updateMainDartForRouterAndScreenUtil(rootPath);

            vscode.window.showInformationMessage(`Flutter Config Initialized with ${archType} and ${stateManagement}!`);
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
                ['Clean Architecture (Feature-First)', 'MVVM (Model-View-ViewModel)'],
                { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
            );
            stateMgmt = await vscode.window.showQuickPick(
                ['BLoC', 'Riverpod'],
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
            if (arch?.includes('Clean')) {
                generateCleanArchFiles(targetDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName);
            } else {
                generateMVVMFiles(targetDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName);
            }

            registerDependenciesInLocator(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt!, models);
            registerRouteInGoRouter(rootPath, featureName, featurePascal, packageName, arch!);

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
                ['Clean Architecture (Feature-First)', 'MVVM (Model-View-ViewModel)'],
                { placeHolder: 'Select Architecture Style', ignoreFocusOut: true }
            );
            stateMgmt = await vscode.window.showQuickPick(
                ['BLoC', 'Riverpod'],
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

        // Determine package name
        let packageName = getPackageName(rootPath);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Configs for Existing ${featurePascal} Screen...`,
            cancellable: false
        }, async (progress) => {
            if (arch?.includes('Clean')) {
                generateCleanArchFiles(featuresDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, true);
            } else {
                generateMVVMFiles(featuresDir, featureName, featurePascal, featureCamel, stateMgmt!, models, packageName, true);
            }

            registerDependenciesInLocator(rootPath, featureName, featurePascal, packageName, arch!, stateMgmt!, models);
            registerRouteInGoRouter(rootPath, featureName, featurePascal, packageName, arch!);

            progress.report({ message: "Running Build Runner to generate files..." });
            await runBuildRunner(rootPath);

            vscode.window.showInformationMessage(`Successfully generated layers and router config for existing screen ${featurePascal}!`);
        });
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

        let packageName = getPackageName(rootPath);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Adding API Action ${actionPascal} (${httpMethod})...`,
            cancellable: false
        }, async (progress) => {
            if (arch.includes('Clean')) {
                await addCleanArchApiAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, httpMethod, endpoint, stateMgmt, packageName);
            } else {
                await addMvvmApiAction(rootPath, featureName, featurePascal, actionCamel, actionPascal, httpMethod, endpoint, stateMgmt, packageName);
            }

            editor.edit((editBuilder) => {
                let callSnippet = '';
                if (stateMgmt === 'BLoC') {
                    if (arch.includes('Clean')) {
                        callSnippet = `context.read<${featurePascal}Bloc>().add(Execute${actionPascal}Event());`;
                    } else {
                        callSnippet = `context.read<${featurePascal}ViewModel>().${actionCamel}();`;
                    }
                } else {
                    if (arch.includes('Clean')) {
                        callSnippet = `ref.read(${featureCamel}NotifierProvider.notifier).${actionCamel}();`;
                    } else {
                        callSnippet = `ref.read(${featureCamel}ViewModelProvider.notifier).${actionCamel}();`;
                    }
                }
                editBuilder.insert(position, callSnippet);
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
                let callSnippet = '';
                if (stateMgmt === 'BLoC') {
                    if (arch.includes('Clean')) {
                        callSnippet = `context.read<${featurePascal}Bloc>().add(Execute${actionPascal}Event());`;
                    } else {
                        callSnippet = `context.read<${featurePascal}ViewModel>().${actionCamel}();`;
                    }
                } else {
                    if (arch.includes('Clean')) {
                        callSnippet = `ref.read(${featureCamel}NotifierProvider.notifier).${actionCamel}();`;
                    } else {
                        callSnippet = `ref.read(${featureCamel}ViewModelProvider.notifier).${actionCamel}();`;
                    }
                }
                editBuilder.insert(position, callSnippet);
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
            await new Promise<void>((resolve) => {
                exec('flutter pub add flutter_dotenv', { cwd: rootPath }, (err, stdout, stderr) => {
                    if (err) console.error(`Pub add env error: ${stderr}`);
                    resolve();
                });
            });

            progress.report({ message: "Configuring assets and files..." });
            configurePubspecForEnvAndL10n(rootPath);
            generateEnvFile(rootPath);
            updateMainDartForEnv(rootPath);

            vscode.window.showInformationMessage("Successfully initialized .env configuration and integrated it into main.dart!");
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
            await new Promise<void>((resolve) => {
                exec('flutter pub add intl', { cwd: rootPath }, (err, stdout, stderr) => {
                    if (err) console.error(`Pub add intl error: ${stderr}`);
                    resolve();
                });
            });

            progress.report({ message: "Configuring pubspec.yaml for localization..." });
            configurePubspecForEnvAndL10n(rootPath);
            generateL10nConfig(rootPath);
            updateMainDartForLocalization(rootPath);

            vscode.window.showInformationMessage("Successfully initialized Localization configuration, ARB files, BuildContext extension, and integrated it into main.dart!");
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
            await new Promise<void>((resolve) => {
                exec('flutter pub add firebase_core firebase_messaging flutter_local_notifications', { cwd: rootPath }, (err, stdout, stderr) => {
                    if (err) console.error(`Pub add notifications error: ${stderr}`);
                    resolve();
                });
            });

            progress.report({ message: "Configuring AndroidManifest.xml and Info.plist..." });
            configureAndroidManifestForNotifications(rootPath);
            configureInfoPlistForNotifications(rootPath);
            generateNotificationService(rootPath);
            updateMainDartForNotifications(rootPath);

            vscode.window.showInformationMessage("Successfully configured Firebase Push & Local Notifications, updated platform files, and integrated into main.dart!");
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
            await new Promise<void>((resolve) => {
                exec('flutter pub add connectivity_plus', { cwd: rootPath }, (err, stdout, stderr) => {
                    if (err) console.error(`Pub add connectivity error: ${stderr}`);
                    resolve();
                });
            });

            progress.report({ message: "Generating Connectivity Service & No Internet screen..." });
            generateConnectivityFiles(rootPath);

            vscode.window.showInformationMessage("Successfully initialized Connectivity Service and added the No Internet Widget!");
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
            await new Promise<void>((resolve) => {
                exec('flutter pub add flutter_secure_storage encrypt', { cwd: rootPath }, (err, stdout, stderr) => {
                    if (err) console.error(`Pub add security error: ${stderr}`);
                    resolve();
                });
            });

            progress.report({ message: "Generating Secure Storage and Encryption services..." });
            generateSecurityFiles(rootPath);
            updateDioForSslPinning(rootPath);

            vscode.window.showInformationMessage("Successfully initialized Security config (Secure Storage, AES, and SSL Pinning support)!");
        });
    });

    context.subscriptions.push(initDisposable);
    context.subscriptions.push(createScreenDisposable);
    context.subscriptions.push(generateForExistingScreenDisposable);
    context.subscriptions.push(generateApiActionDisposable);
    context.subscriptions.push(generateLocalStateActionDisposable);
    context.subscriptions.push(initEnvDisposable);
    context.subscriptions.push(initLocalizationDisposable);
    context.subscriptions.push(initNotificationsDisposable);
    context.subscriptions.push(initConnectivityDisposable);
    context.subscriptions.push(initSecurityDisposable);
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

function parseJsonToModel(name: string, inputJson: string | undefined): FeatureModel {
    const pascal = toPascalCase(name);
    const snake = toSnakeCase(name);
    const camel = toCamelCase(name);
    let properties: ModelProperty[] = [];

    if (inputJson && inputJson.trim() !== '') {
        try {
            const parsed = JSON.parse(inputJson.trim());
            for (const key of Object.keys(parsed)) {
                const value = parsed[key];
                let type = 'dynamic';
                if (typeof value === 'number') {
                    type = Number.isInteger(value) ? 'int' : 'double';
                } else if (typeof value === 'string') {
                    type = 'String';
                } else if (typeof value === 'boolean') {
                    type = 'bool';
                } else if (Array.isArray(value)) {
                    type = 'List<dynamic>';
                } else if (value && typeof value === 'object') {
                    type = 'Map<String, dynamic>';
                }
                properties.push({ name: key, type: type });
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
        properties: properties
    };
}

function getPackageName(rootPath: string): string {
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

// Convert helpers
function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}

function toPascalCase(str: string): string {
    const camel = toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toCamelCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
        .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

async function installDependencies(rootPath: string, stateManagement: string): Promise<void> {
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
        } else {
            pkgs.push('flutter_riverpod');
            pkgs.push('riverpod_annotation');
        }

        const devPkgs = [
            'build_runner',
            'freezed',
            'json_serializable'
        ];

        const cmd = `flutter pub add ${pkgs.join(' ')} --dev ${devPkgs.join(' ')}`;
        exec(cmd, { cwd: rootPath }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Pub add error: ${stderr}`);
            }
            resolve();
        });
    });
}

function generateCoreConfig(rootPath: string) {
    const diDir = path.join(rootPath, 'lib', 'core', 'di');
    const networkDir = path.join(rootPath, 'lib', 'core', 'network');
    const routerDir = path.join(rootPath, 'lib', 'core', 'router');

    fs.mkdirSync(diDir, { recursive: true });
    fs.mkdirSync(networkDir, { recursive: true });
    fs.mkdirSync(routerDir, { recursive: true });

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
    if (!fs.existsSync(dioPath)) {
        const dioTemplate = `import 'package:dio/dio.dart';
import 'token_service.dart';

class DioModule {
  Dio get dio {
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
        const diTemplate = `import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';
import '../network/dio_configuration.dart';

final getIt = GetIt.instance;

void configureDependencies() {
  // Core
  getIt.registerLazySingleton<Dio>(() => DioModule().dio);
  
  // Features register tag (DO NOT REMOVE)
}
`;
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

function updateMainDartForRouterAndScreenUtil(rootPath: string) {
    const mainPath = path.join(rootPath, 'lib', 'main.dart');
    if (!fs.existsSync(mainPath)) return;

    const mainTemplate = `import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'core/di/injection.dart';
import 'core/router/app_router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  configureDependencies();
  runApp(const MyApp());
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
    fs.writeFileSync(mainPath, mainTemplate);
}

function registerRouteInGoRouter(
    rootPath: string, 
    name: string, 
    pascal: string, 
    packageName: string,
    arch: string
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
        content = importPath + '\n' + content;
    }

    // Insert GoRoute registration if not already present (using PageClass.route)
    const routeDecl = `GoRoute(
      path: ${pageClass}.route,
      builder: (context, state) => const ${pageClass}(),
    ),`;

    if (!content.includes(`path: ${pageClass}.route`)) {
        const tag = '// Routes register tag (DO NOT REMOVE)';
        content = content.replace(tag, routeDecl + '\n    ' + tag);
    }

    fs.writeFileSync(routerPath, content);
}

function registerDependenciesInLocator(
    rootPath: string, 
    name: string, 
    pascal: string, 
    packageName: string,
    arch: string,
    stateMgmt: string,
    models: FeatureModel[]
) {
    const diPath = path.join(rootPath, 'lib', 'core', 'di', 'injection.dart');
    if (!fs.existsSync(diPath)) return;

    let content = fs.readFileSync(diPath, 'utf8');

    let imports = '';
    let registrations = '';

    if (arch.includes('Clean')) {
        for (const m of models) {
            const remoteDataSourceCheck = `getIt.registerLazySingleton<${m.modelNamePascal}RemoteDataSource>`;
            if (!content.includes(remoteDataSourceCheck)) {
                imports += `import 'package:${packageName}/features/${name}/data/datasources/${m.modelNameSnake}_remote_data_source.dart';
import 'package:${packageName}/features/${name}/data/repositories/${m.modelNameSnake}_repository_impl.dart';
import 'package:${packageName}/features/${name}/domain/repositories/${m.modelNameSnake}_repository.dart';
import 'package:${packageName}/features/${name}/domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import 'package:${packageName}/features/${name}/domain/usecases/delete_${m.modelNameSnake}_usecase.dart';
`;
                registrations += `
  getIt.registerLazySingleton<${m.modelNamePascal}RemoteDataSource>(
    () => ${m.modelNamePascal}RemoteDataSourceImpl(getIt<Dio>()),
  );
  getIt.registerLazySingleton<${m.modelNamePascal}Repository>(
    () => ${m.modelNamePascal}RepositoryImpl(getIt<${m.modelNamePascal}RemoteDataSource>()),
  );
  getIt.registerLazySingleton<Get${m.modelNamePascal}UseCase>(
    () => Get${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Create${m.modelNamePascal}UseCase>(
    () => Create${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
  );
  getIt.registerLazySingleton<Update${m.modelNamePascal}UseCase>(
    () => Update${m.modelNamePascal}UseCase(getIt<${m.modelNamePascal}Repository>()),
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
                const usecaseConstructorArgs = models.map(m => `getIt<Get${m.modelNamePascal}UseCase>()`).join(', ');
                const allUsecaseArgs = models.map(m => `get${m.modelNamePascal}UseCase: getIt<Get${m.modelNamePascal}UseCase>(),\n      create${m.modelNamePascal}UseCase: getIt<Create${m.modelNamePascal}UseCase>(),\n      update${m.modelNamePascal}UseCase: getIt<Update${m.modelNamePascal}UseCase>(),\n      delete${m.modelNamePascal}UseCase: getIt<Delete${m.modelNamePascal}UseCase>()`).join(',\n      ');
                registrations += `  getIt.registerFactory<${pascal}Bloc>(
    () => ${pascal}Bloc(
      ${allUsecaseArgs},
    ),
  );\n`;
            }
        }
    } else {
        // MVVM
        for (const m of models) {
            const modelImportCheck = `import 'package:${packageName}/features/${name}/models/${m.modelNameSnake}_model.dart';`;
            if (!content.includes(modelImportCheck)) {
                imports += `${modelImportCheck}\n`;
            }
        }

        if (stateMgmt === 'BLoC') {
            const blocCheck = `getIt.registerFactory<${pascal}ViewModel>`;
            if (!content.includes(blocCheck)) {
                imports += `import 'package:${packageName}/features/${name}/viewmodels/${name}_viewmodel.dart';\n`;
                registrations += `
  getIt.registerFactory<${pascal}ViewModel>(
    () => ${pascal}ViewModel(getIt<Dio>()),
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
        content = content.replace(tag, `\n  // ${pascal} Feature` + registrations + '  ' + tag);
    }

    fs.writeFileSync(diPath, content);
}

function generateCleanArchFiles(
    targetDir: string, 
    name: string, 
    pascal: string, 
    camel: string, 
    stateMgmt: string, 
    models: FeatureModel[],
    packageName: string,
    skipPageIfExists = false
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
    } else {
        fs.mkdirSync(path.join(presDir, 'riverpod'), { recursive: true });
    }
    fs.mkdirSync(path.join(presDir, 'pages'), { recursive: true });

    // Generate files for each model
    for (const m of models) {
        // 1. Entity
        const entityPropertiesDecl = m.properties.map(p => `  final ${p.type} ${p.name};`).join('\n');
        const entityConstructorDecl = m.properties.map(p => `    required this.${p.name},`).join('\n');
        
        fs.writeFileSync(
            path.join(domainDir, 'entities', `${m.modelNameSnake}_entity.dart`),
            `class ${m.modelNamePascal}Entity {
${entityPropertiesDecl}

  const ${m.modelNamePascal}Entity({
${entityConstructorDecl}
  });
}
`
        );

        // 2. Repository Contract
        fs.writeFileSync(
            path.join(domainDir, 'repositories', `${m.modelNameSnake}_repository.dart`),
            `import '../entities/${m.modelNameSnake}_entity.dart';

abstract class ${m.modelNamePascal}Repository {
  Future<${m.modelNamePascal}Entity> get${m.modelNamePascal}Data();
  Future<${m.modelNamePascal}Entity> create${m.modelNamePascal}(${m.modelNamePascal}Entity entity);
  Future<${m.modelNamePascal}Entity> update${m.modelNamePascal}(${m.modelNamePascal}Entity entity);
  Future<void> delete${m.modelNamePascal}(dynamic id);
}
`
        );

        // 3a. Get Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `get_${m.modelNameSnake}_usecase.dart`),
            `import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

class Get${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Get${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute() {
    return repository.get${m.modelNamePascal}Data();
  }
}
`
        );

        // 3b. Create Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `create_${m.modelNameSnake}_usecase.dart`),
            `import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

class Create${m.modelNamePascal}UseCase {
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
            `import '../entities/${m.modelNameSnake}_entity.dart';
import '../repositories/${m.modelNameSnake}_repository.dart';

class Update${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Update${m.modelNamePascal}UseCase(this.repository);

  Future<${m.modelNamePascal}Entity> execute(${m.modelNamePascal}Entity entity) {
    return repository.update${m.modelNamePascal}(entity);
  }
}
`
        );

        // 3d. Delete Usecase
        fs.writeFileSync(
            path.join(domainDir, 'usecases', `delete_${m.modelNameSnake}_usecase.dart`),
            `import '../repositories/${m.modelNameSnake}_repository.dart';

class Delete${m.modelNamePascal}UseCase {
  final ${m.modelNamePascal}Repository repository;

  Delete${m.modelNamePascal}UseCase(this.repository);

  Future<void> execute(dynamic id) {
    return repository.delete${m.modelNamePascal}(id);
  }
}
`
        );

        // 4. Model (Freezed)
        const modelPropertiesDecl = m.properties.map(p => `    required ${p.type} ${p.name},`).join('\n');
        const modelToEntityMapper = m.properties.map(p => `      ${p.name}: ${p.name},`).join('\n');

        fs.writeFileSync(
            path.join(dataDir, 'models', `${m.modelNameSnake}_model.dart`),
            `import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/entities/${m.modelNameSnake}_entity.dart';

part '${m.modelNameSnake}_model.freezed.dart';
part '${m.modelNameSnake}_model.g.dart';

@freezed
abstract class ${m.modelNamePascal}Model with _\$${m.modelNamePascal}Model {
  const factory ${m.modelNamePascal}Model({
${modelPropertiesDecl}
  }) = _${m.modelNamePascal}Model;

  factory ${m.modelNamePascal}Model.fromJson(Map<String, dynamic> json) => _\$${m.modelNamePascal}ModelFromJson(json);

  const ${m.modelNamePascal}Model._();

  ${m.modelNamePascal}Entity toEntity() => ${m.modelNamePascal}Entity(
${modelToEntityMapper}
  );
}
`
        );

        // 5. Data Source
        fs.writeFileSync(
            path.join(dataDir, 'datasources', `${m.modelNameSnake}_remote_data_source.dart`),
            `import 'package:dio/dio.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
import '../models/${m.modelNameSnake}_model.dart';

abstract class ${m.modelNamePascal}RemoteDataSource {
  Future<${m.modelNamePascal}Model> fetch${m.modelNamePascal}Data();
  Future<${m.modelNamePascal}Model> create${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<${m.modelNamePascal}Model> update${m.modelNamePascal}(${m.modelNamePascal}Model model);
  Future<void> delete${m.modelNamePascal}(dynamic id);
}

class ${m.modelNamePascal}RemoteDataSourceImpl implements ${m.modelNamePascal}RemoteDataSource {
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

        // 6. Repository Impl
        fs.writeFileSync(
            path.join(dataDir, 'repositories', `${m.modelNameSnake}_repository_impl.dart`),
            `import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/repositories/${m.modelNameSnake}_repository.dart';
import '../datasources/${m.modelNameSnake}_remote_data_source.dart';
import '../models/${m.modelNameSnake}_model.dart';

class ${m.modelNamePascal}RepositoryImpl implements ${m.modelNamePascal}Repository {
  final ${m.modelNamePascal}RemoteDataSource remoteDataSource;

  ${m.modelNamePascal}RepositoryImpl(this.remoteDataSource);

  @override
  Future<${m.modelNamePascal}Entity> get${m.modelNamePascal}Data() async {
    final model = await remoteDataSource.fetch${m.modelNamePascal}Data();
    return model.toEntity();
  }

  @override
  Future<${m.modelNamePascal}Entity> create${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${m.properties.map(p => `${p.name}: entity.${p.name},`).join('\n      ')}
    );
    final result = await remoteDataSource.create${m.modelNamePascal}(model);
    return result.toEntity();
  }

  @override
  Future<${m.modelNamePascal}Entity> update${m.modelNamePascal}(${m.modelNamePascal}Entity entity) async {
    final model = ${m.modelNamePascal}Model(
      ${m.properties.map(p => `${p.name}: entity.${p.name},`).join('\n      ')}
    );
    final result = await remoteDataSource.update${m.modelNamePascal}(model);
    return result.toEntity();
  }

  @override
  Future<void> delete${m.modelNamePascal}(dynamic id) async {
    await remoteDataSource.delete${m.modelNamePascal}(id);
  }
}
`
        );
    }

    // 7. State Management
    if (stateMgmt === 'BLoC') {
        const blocPath = path.join(presDir, 'bloc', `${name}_bloc.dart`);
        const eventPath = path.join(presDir, 'bloc', `${name}_event.dart`);
        const statePath = path.join(presDir, 'bloc', `${name}_state.dart`);

        if (!skipPageIfExists || !fs.existsSync(blocPath)) {
            // Event
            fs.writeFileSync(
                eventPath,
                `part of '${name}_bloc.dart';

abstract class ${pascal}Event {}

class Fetch${pascal}Event extends ${pascal}Event {}
`
            );

            // State
            const stateFields = models.map(m => `  final ${m.modelNamePascal}Entity? ${m.modelNameCamel}Data;`).join('\n');
            const stateConstructorArgs = models.map(m => `this.${m.modelNameCamel}Data,`).join('\n');

            fs.writeFileSync(
                statePath,
                `part of '${name}_bloc.dart';

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
`
            );

            // Bloc
            const blocImports = models.map(m => `import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/create_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/update_${m.modelNameSnake}_usecase.dart';
import '../../domain/usecases/delete_${m.modelNameSnake}_usecase.dart';`).join('\n');
            const blocFields = models.map(m => `  final Get${m.modelNamePascal}UseCase get${m.modelNamePascal}UseCase;
  final Create${m.modelNamePascal}UseCase create${m.modelNamePascal}UseCase;
  final Update${m.modelNamePascal}UseCase update${m.modelNamePascal}UseCase;
  final Delete${m.modelNamePascal}UseCase delete${m.modelNamePascal}UseCase;`).join('\n');
            const blocConstructorArgs = models.map(m => `    required this.get${m.modelNamePascal}UseCase,
    required this.create${m.modelNamePascal}UseCase,
    required this.update${m.modelNamePascal}UseCase,
    required this.delete${m.modelNamePascal}UseCase,`).join('\n');
            
            let parallelExecution = '';
            let loadedConstructorParams = '';
            if (models.length > 0) {
                parallelExecution = `final results = await Future.wait([
          ${models.map(m => `get${m.modelNamePascal}UseCase.execute().catchError((_) => null),`).join('\n          ')}
        ]);`;
                loadedConstructorParams = models.map((m, idx) => `          ${m.modelNameCamel}Data: results[${idx}] as ${m.modelNamePascal}Entity?,`).join('\n');
            }

            fs.writeFileSync(
                blocPath,
                `import 'package:flutter_bloc/flutter_bloc.dart';
${blocImports}

part '${name}_event.dart';
part '${name}_state.dart';

class ${pascal}Bloc extends Bloc<${pascal}Event, ${pascal}State> {
${blocFields}

  ${pascal}Bloc({
${blocConstructorArgs}
  }) : super(${pascal}Initial()) {
    on<Fetch${pascal}Event>((event, emit) async {
      emit(${pascal}Loading());
      try {
        ${parallelExecution}

        emit(${pascal}Loaded(
${loadedConstructorParams}
        ));
      } catch (e) {
        emit(${pascal}Error(e.toString()));
      }
    });
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
`
            );
        }
    } else {
        // Riverpod
        const providerPath = path.join(presDir, 'riverpod', `${name}_provider.dart`);
        if (!skipPageIfExists || !fs.existsSync(providerPath)) {
            const notifierImports = models.map(m => `import '../../domain/entities/${m.modelNameSnake}_entity.dart';
import '../../domain/usecases/get_${m.modelNameSnake}_usecase.dart';`).join('\n');

            let notifierBuildBody = '';
            if (models.length > 0) {
                notifierBuildBody = `final results = await Future.wait([
      ${models.map(m => `getIt<Get${m.modelNamePascal}UseCase>().execute().catchError((_) => null),`).join('\n      ')}
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
    }
}

function generateMVVMFiles(
    targetDir: string, 
    name: string, 
    pascal: string, 
    camel: string, 
    stateMgmt: string, 
    models: FeatureModel[],
    packageName: string,
    skipPageIfExists = false
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
        const modelPropertiesDecl = m.properties.map(p => `    required ${p.type} ${p.name},`).join('\n');

        fs.writeFileSync(
            path.join(modelsDir, `${m.modelNameSnake}_model.dart`),
            `import 'package:freezed_annotation/freezed_annotation.dart';

part '${m.modelNameSnake}_model.freezed.dart';
part '${m.modelNameSnake}_model.g.dart';

@freezed
abstract class ${m.modelNamePascal}Model with _\$${m.modelNamePascal}Model {
  const factory ${m.modelNamePascal}Model({
${modelPropertiesDecl}
  }) = _${m.modelNamePascal}Model;

  factory ${m.modelNamePascal}Model.fromJson(Map<String, dynamic> json) => _\$${m.modelNamePascal}ModelFromJson(json);
}
`
        );
    }

    // ViewModel & View depending on State Management
    if (stateMgmt === 'BLoC') {
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            const stateFields = models.map(m => `  final ${m.modelNamePascal}Model? ${m.modelNameCamel}Model;`).join('\n');
            const stateConstructorArgs = models.map(m => `this.${m.modelNameCamel}Model,`).join('\n');

            // ViewModel (as Cubit)
            fs.writeFileSync(
                vmPath,
                `import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:dio/dio.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';`).join('\n')}

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

class ${pascal}ViewModel extends Cubit<${pascal}State> {
  final Dio dio;

  ${pascal}ViewModel(this.dio) : super(${pascal}Initial());

  Future<void> fetch${pascal}Data() async {
    emit(${pascal}Loading());
    try {
      final results = await Future.wait([
        ${models.map(m => `dio.getRequest('/${m.modelNameSnake}').catchError((_) => Response(requestOptions: RequestOptions())),`).join('\n        ')}
      ]);

      emit(${pascal}Loaded(
        ${models.map((m, idx) => `${m.modelNameCamel}Model: results[${idx}].data != null ? ${m.modelNamePascal}Model.fromJson(results[${idx}].data as Map<String, dynamic>) : null,`).join('\n        ')}
      ));
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
    } else {
        // ViewModel (as Riverpod Notifier)
        const vmPath = path.join(vmDir, `${name}_viewmodel.dart`);
        if (!skipPageIfExists || !fs.existsSync(vmPath)) {
            fs.writeFileSync(
                vmPath,
                `import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:dio/dio.dart';
import 'package:${packageName}/core/di/injection.dart';
import 'package:${packageName}/core/network/dio_extensions.dart';
${models.map(m => `import '../models/${m.modelNameSnake}_model.dart';`).join('\n')}

part '${name}_viewmodel.g.dart';

@riverpod
class ${pascal}ViewModel extends _\$${pascal}ViewModel {
  @override
  FutureOr<List<dynamic>> build() async {
    final dio = getIt<Dio>();
    final results = await Future.wait([
      ${models.map(m => `dio.getRequest('/${m.modelNameSnake}').catchError((_) => Response(requestOptions: RequestOptions())),`).join('\n      ')}
    ]);
    return [
      ${models.map((m, idx) => `results[${idx}].data != null ? ${m.modelNamePascal}Model.fromJson(results[${idx}].data as Map<String, dynamic>) : null,`).join('\n      ')}
    ];
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
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../viewmodels/${name}_viewmodel.dart';

class ${pascal}View extends ConsumerWidget {
  static const route = '/${name}';
  const ${pascal}View({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(${camel}ViewModelProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('${pascal}')),
      body: state.when(
        data: (modelsList) => const Center(child: Text('MVVM Riverpod Data Loaded Resiliently!')),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text(err.toString())),
      ),
    );
  }
}
`
            );
        }
    }
}

async function addCleanArchApiAction(
    rootPath: string,
    featureName: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string,
    httpMethod: string,
    endpoint: string,
    stateMgmt: string,
    packageName: string
) {
    const featDir = path.join(rootPath, 'lib', 'features', featureName);
    const dataDir = path.join(featDir, 'data');
    const domainDir = path.join(featDir, 'domain');
    const presDir = path.join(featDir, 'presentation');

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
      throw Exception("Failed to execute ${actionCamel}: \\$e");
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
    const ucContent = `import '../repositories/${featureName}_repository.dart';

class ${actionPascal}UseCase {
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

async function addMvvmApiAction(
    rootPath: string,
    featureName: string,
    featurePascal: string,
    actionCamel: string,
    actionPascal: string,
    httpMethod: string,
    endpoint: string,
    stateMgmt: string,
    packageName: string
) {
    const featDir = path.join(rootPath, 'lib', 'features', featureName);
    const vmDir = path.join(featDir, 'viewmodels');

    if (stateMgmt === 'BLoC') {
        const vmPath = path.join(vmDir, `${featureName}_viewmodel.dart`);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            const searchConstructor = `  ${featurePascal}ViewModel(this.dio) : super(${featurePascal}Initial());`;
            const methodCode = `\n  Future<void> ${actionCamel}() async {
    emit(${featurePascal}Loading());
    try {
      await dio.${httpMethod.toLowerCase()}Request('${endpoint}');
      await fetch${featurePascal}Data();
    } catch (e) {
      emit(${featurePascal}Error(e.toString()));
    }
  }\n`;
            content = content.replace(searchConstructor, `${searchConstructor}\n${methodCode}`);
            fs.writeFileSync(vmPath, content);
        }
    } else {
        const vmPath = path.join(vmDir, `${featureName}_viewmodel.dart`);
        if (fs.existsSync(vmPath)) {
            let content = fs.readFileSync(vmPath, 'utf8');
            const classTag = `class ${featurePascal}ViewModel extends _\$${featurePascal}ViewModel {`;
            const methodCode = `  Future<void> ${actionCamel}() async {
    state = const AsyncValue.loading();
    try {
      final dio = getIt<Dio>();
      await dio.${httpMethod.toLowerCase()}Request('${endpoint}');
      ref.invalidateSelf();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }\n`;
            content = content.replace(classTag, `${classTag}\n${methodCode}`);
            fs.writeFileSync(vmPath, content);
        }
    }
}

async function addLocalStateAction(
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
        // MVVM
        if (stateMgmt === 'BLoC') {
            const vmPath = path.join(vmDir, `${featureName}_viewmodel.dart`);
            if (fs.existsSync(vmPath)) {
                let content = fs.readFileSync(vmPath, 'utf8');
                const classTag = `class ${featurePascal}ViewModel extends Cubit<${featurePascal}State> {`;
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
                fs.writeFileSync(vmPath, content);
            }
        } else {
            const vmPath = path.join(vmDir, `${featureName}_viewmodel.dart`);
            if (fs.existsSync(vmPath)) {
                let content = fs.readFileSync(vmPath, 'utf8');
                const classTag = `class ${featurePascal}ViewModel extends _\$${featurePascal}ViewModel {`;
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
                fs.writeFileSync(vmPath, content);
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
        const depTag = 'dependencies:';
        const localizationsDep = `\n  flutter_localizations:\n    sdk: flutter`;
        content = content.replace(depTag, depTag + localizationsDep);
    }

    // 2. Add generate: true under flutter
    if (!content.includes('generate: true')) {
        const flutterTag = 'flutter:';
        content = content.replace(flutterTag, `${flutterTag}\n  generate: true`);
    }

    // 3. Add .env to assets under flutter
    if (!content.includes('.env')) {
        if (content.includes('assets:')) {
            content = content.replace('assets:', `assets:\n    - .env`);
        } else {
            const flutterTag = 'flutter:';
            content = content.replace(flutterTag, `${flutterTag}\n  assets:\n    - .env`);
        }
    }

    fs.writeFileSync(pubspecPath, content);
}

function generateEnvFile(rootPath: string) {
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

function generateL10nConfig(rootPath: string) {
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
    if (content.includes('void main() {')) {
        content = content.replace('void main() {', 'void main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n  await dotenv.load(fileName: ".env");');
    } else if (content.includes('void main() async {')) {
        if (!content.includes('dotenv.load')) {
            content = content.replace('void main() async {', 'void main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n  await dotenv.load(fileName: ".env");');
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

function generateNotificationService(rootPath: string) {
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
    if (!content.includes('Firebase.initializeApp()')) {
        if (content.includes('void main() {')) {
            content = content.replace('void main() {', `void main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n${initSnippet}`);
        } else if (content.includes('void main() async {')) {
            content = content.replace('void main() async {', `void main() async {\n  WidgetsFlutterBinding.ensureInitialized();\n${initSnippet}`);
        }
    }

    fs.writeFileSync(mainPath, content);
}

function generateConnectivityFiles(rootPath: string) {
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
    _connectivity.onConnectivityChanged.listen((ConnectivityResult result) {
      _connectionStreamController.add(result != ConnectivityResult.none);
    });
  }

  Future<bool> checkConnection() async {
    final result = await _connectivity.checkConnectivity();
    return result != ConnectivityResult.none;
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
}

function generateSecurityFiles(rootPath: string) {
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

function updateDioForSslPinning(rootPath: string) {
    const dioPath = path.join(rootPath, 'lib', 'core', 'network', 'dio_configuration.dart');
    if (!fs.existsSync(dioPath)) return;

    let content = fs.readFileSync(dioPath, 'utf8');

    // Add imports
    const importIo = "import 'dart:io';\nimport 'package:dio/io.dart';";
    if (!content.includes('package:dio/io.dart')) {
        content = `${importIo}\n` + content;
    }

    // Add HttpClientAdapter configuration
    const pinningSnippet = `    // SSL Pinning Configuration (Optional per host)
    dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.badCertificateCallback = (X509Certificate cert, String host, int port) {
          // Example: Pin certificate fingerprint for a secure domain
          if (host == "api.yourdomain.com") {
            const pinnedFingerprint = "SHA-256-FINGERPRINT-OF-YOUR-SERVER";
            // TODO: Compare cert.sha256 fingerprint with pinnedFingerprint
            return false; // Reject bad/non-matching certificates
          }
          return true; // Allow other domains
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

async function runBuildRunner(rootPath: string): Promise<void> {
    return new Promise((resolve) => {
        exec('dart run build_runner build --delete-conflicting-outputs', { cwd: rootPath }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Build runner error: ${stderr}`);
            }
            resolve();
        });
    });
}

export function deactivate() {}
