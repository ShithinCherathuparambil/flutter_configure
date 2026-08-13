import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Integration Tests', () => {
    vscode.window.showInformationMessage('Start integration tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.all.some(ext => ext.id.endsWith('flutter-config')));
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.all.find(ext => ext.id.endsWith('flutter-config'));
        assert.ok(extension);
        if (!extension.isActive) {
            await extension.activate();
        }
        assert.strictEqual(extension.isActive, true);
    });

    test('All commands should be registered in vscode', async () => {
        const registeredCommands = await vscode.commands.getCommands(true);
        const expectedCommands = [
            'flutter-config.init',
            'flutter-config.createScreen',
            'flutter-config.generateApiAction',
            'flutter-config.generateLocalStateAction',
            'flutter-config.initEnv',
            'flutter-config.initLocalization',
            'flutter-config.initNotifications',
            'flutter-config.initConnectivity',
            'flutter-config.initSecurity',
            'flutter-config.initTheme',
            'flutter-config.generateSignedAppBundle',
            'flutter-config.initTests',
            'flutter-config.initCICD',
            'flutter-config.initFlavors',
            'flutter-config.createPaginatedList',
            'flutter-config.createCubit',
            'flutter-config.initMethodChannel',
            'flutter-config.initLints'
        ];

        for (const cmd of expectedCommands) {
            assert.ok(
                registeredCommands.includes(cmd),
                `Command "${cmd}" should be registered`
            );
        }
    });
});
